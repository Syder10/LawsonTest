-- ============================================================================
-- 0008_stock_separation.sql
--
-- Separates STOCK KEEPING from PROCUREMENT, and builds out the stock side:
-- supplier invoices and an outbound dispatch log.
--
-- Runs AFTER 0007. Self-contained — its own RLS and its own grants — so it can
-- be applied on its own to an already-migrated database, following the pattern
-- 0006 and 0007 established.
--
-- WHAT THIS CHANGES
-- -----------------
--   1. A fourth operational role, `stock`. It owns every PHYSICAL movement:
--      material receipts, supplier invoices, stock counts, and dispatch.
--   2. `procurement` becomes READ-ONLY. It keeps sight of every stock screen and
--      can write nothing.
--   3. New tables: invoices + invoice_lines, dispatches + dispatch_lines.
--   4. raw_materials_received gains a nullable invoice_line_id, so what arrived
--      can be compared with what was billed.
--
-- WHY SPLIT THE ROLE. Today one role both records movements and reads the
-- analytics — two different people in the building. Anyone who can read a stock
-- report can also log a receipt, and a stock count RE-ANCHORS the derived ledger,
-- so a wrong count is not a display bug: it rewrites history.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ----------------------------------
-- Dispatch does NOT feed the finished-goods balance, and there is no variance
-- report. finished_goods_stock() keeps deriving from
-- packaging_daily_records.quantity_cartons_loaded. The dispatch log records the
-- same physical event in far more detail, beside it.
--
-- The consequence, stated here because it will be noticed: the sum of dispatched
-- cartons need not equal total cartons loaded, and nothing flags the difference.
-- Making dispatch authoritative would change what the finished-goods number means
-- and require every historical row to be re-sourced; a variance report would
-- produce a permanent non-zero difference between a packaging supervisor's shift
-- figure and a stock keeper's per-load figures, which nobody has the authority to
-- resolve. See PRD.md §3.3. Do not "fix" this.
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 1. The `stock` role
-- ════════════════════════════════════════════════════════════════════════════

-- Idempotent: re-applying the file must not fail. `alter type ... add value`
-- cannot run inside a transaction block in older Postgres, but `if not exists`
-- makes it a no-op on the second run, which is what matters here.
alter type public.user_role add value if not exists 'stock';

comment on type public.user_role is
  'admin | manager | supervisor | procurement | stock. '
  '`stock` records physical movements (receipts, invoices, counts, dispatch); '
  '`procurement` is read-only over the same data.';

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Role helpers: one predicate cannot express both "may write" and "may read"
--
-- WHY is_procurement_staff() IS KEPT. It is referenced by five policies in 0004
-- and 0005 plus record_stock_count(). Dropping it would mean rewriting every one
-- of those in this file, and a policy rewrite is exactly where an access-control
-- regression hides. Redefining it as the READ predicate leaves the read surface
-- unchanged by construction — it gains `stock`, which is correct — and only the
-- WRITE paths below are touched.
-- ════════════════════════════════════════════════════════════════════════════

-- May CREATE receipts, invoices, stock counts and dispatches.
-- Managers and admins are included because management owns reconciliation: a
-- stock count is their instrument for correcting ledger drift.
create or replace function public.can_write_stock()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(
    (select role in ('stock', 'manager', 'admin') from public.profiles where id = auth.uid()),
    false
  );
end;
$$;

comment on function public.can_write_stock() is
  'True for stock / manager / admin — the roles that may record physical stock movements.';

-- May READ every stock screen. Adds `procurement`, which writes nothing.
create or replace function public.can_read_stock()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return coalesce(
    (select role in ('stock', 'procurement', 'manager', 'admin') from public.profiles where id = auth.uid()),
    false
  );
end;
$$;

comment on function public.can_read_stock() is
  'True for stock / procurement / manager / admin — the roles that may read stock data.';

-- Redefined as an ALIAS of the read predicate (was: procurement/manager/admin).
-- Every existing policy that uses it is a SELECT policy plus two write policies
-- replaced in section 3 below, so widening it to include `stock` is exactly the
-- intended change and no policy text has to move.
create or replace function public.is_procurement_staff()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return public.can_read_stock();
end;
$$;

comment on function public.is_procurement_staff() is
  'DEPRECATED ALIAS of can_read_stock(), kept so the policies written against it '
  'in 0004/0005 need no rewrite. New code should call can_read_stock() or '
  'can_write_stock() explicitly.';

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Existing write paths move behind can_write_stock()
--
-- These are the two places `procurement` could previously write. Dropped and
-- recreated rather than altered, because a policy's USING/WITH CHECK expression
-- cannot be changed in place.
-- ════════════════════════════════════════════════════════════════════════════

-- Receipts: procurement could insert. Now only stock/manager/admin can.
drop policy if exists "raw_materials_insert" on public.raw_materials_received;
create policy "raw_materials_insert" on public.raw_materials_received
  for insert to authenticated with check (public.can_write_stock());

-- Stock counts: the table's own write policy was admin-only already (normal writes
-- go through record_stock_count()), so ONLY the RPC's internal gate changes here.
-- The body is otherwise a faithful copy of 0005's — the quantity validation and
-- the counted_by lookup are deliberately unchanged, because a "while I'm here"
-- edit inside a security-sensitive function is how a regression arrives disguised
-- as an authorisation change.
create or replace function public.record_stock_count(
  p_material text,
  p_date     date,
  p_counted  numeric,
  p_shift    public.shift_type   default null,
  p_product  public.product_type default null,
  p_variant  text                default null,
  p_kind     text                default 'reconciliation',
  p_note     text                default null
)
returns public.stock_counts
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_computed numeric;
  v_row      public.stock_counts;
begin
  -- CHANGED in 0008: was is_procurement_staff(). A count RE-ANCHORS the ledger, so
  -- it is a write, and the read-only procurement office must not perform it.
  if not public.can_write_stock() then
    raise exception 'not authorized to record stock counts' using errcode = '42501';
  end if;
  if p_counted is null or p_counted < 0 then
    raise exception 'counted quantity must be a non-negative number';
  end if;

  v_computed := public.stock_balance_core(
    p_material, p_product, p_variant, p_date, coalesce(public.shift_rank(p_shift), 3), false
  );

  insert into public.stock_counts
    (date, shift, material, product, variant, counted_qty, computed_qty, kind, note, counted_by, user_id)
  values
    (p_date, p_shift, p_material, p_product, p_variant, p_counted, v_computed, p_kind, p_note,
     (select full_name from public.profiles where id = auth.uid()), auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.record_stock_count(text, date, numeric, public.shift_type, public.product_type, text, text, text)
  from public, anon;
grant execute on function public.record_stock_count(text, date, numeric, public.shift_type, public.product_type, text, text, text)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 4. Supplier invoices
--
-- An invoice is what the SUPPLIER's document says. It is recorded for
-- reconciliation, not posted to any accounting ledger — there are no payments,
-- no ageing and no purchase orders here (PRD.md §3.2).
-- ════════════════════════════════════════════════════════════════════════════

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  supplier       text not null check (length(trim(supplier)) > 0),
  invoice_number text not null check (length(trim(invoice_number)) > 0),
  invoice_date   date not null,

  -- Currency lives beside the amount. A bare number is not a price, and this
  -- plant buys in more than one currency.
  currency       text not null default 'GHS' check (currency ~ '^[A-Z]{3}$'),

  -- What the DOCUMENT declares, which is not necessarily the sum of the lines:
  -- real invoices carry freight, tax and discounts that the line model does not
  -- represent. The app WARNS on a mismatch and does not block it — refusing a
  -- real document because our arithmetic disagrees pushes users to type a fake
  -- total, and then the record is worthless. numeric, never float.
  declared_total numeric(14, 2) check (declared_total >= 0),

  remarks        text,
  recorded_by    text,
  user_id        uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- The same invoice number from two different suppliers is legitimate; twice
  -- from one supplier is a duplicate entry.
  constraint invoices_supplier_number_key unique (supplier, invoice_number)
);

create index invoices_date_idx     on public.invoices (invoice_date desc);
create index invoices_supplier_idx on public.invoices (supplier);

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

comment on table public.invoices is
  'Supplier invoice headers. declared_total is what the document says and may '
  'legitimately differ from the sum of invoice_lines — see FR-9 in PRD.md.';

-- ── Invoice lines ───────────────────────────────────────────────────────────
create table public.invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,

  -- Free text rather than an FK to a material table on purpose: an invoice can
  -- carry freight, a spare part or a service line, none of which is a stock
  -- material. A receipt links to the LINE, and it is the receipt that carries the
  -- constrained material_type.
  material_type text not null check (length(trim(material_type)) > 0),
  description   text,

  quantity      numeric(14, 3) not null check (quantity > 0),
  unit          text not null check (length(trim(unit)) > 0),
  unit_cost     numeric(14, 4) not null default 0 check (unit_cost >= 0),

  -- GENERATED, like every other computable column in this schema. The database is
  -- the source of truth for arithmetic; a stored copy is a thing that can drift.
  line_total    numeric(18, 4) generated always as (quantity * unit_cost) stored,

  display_order smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index invoice_lines_invoice_idx  on public.invoice_lines (invoice_id);
create index invoice_lines_material_idx on public.invoice_lines (material_type);

comment on table public.invoice_lines is
  'Invoice line items. line_total is generated (quantity × unit_cost). material_type '
  'is free text because an invoice may carry non-stock lines such as freight.';

-- ── Link a receipt to the line it was billed under ──────────────────────────
-- NULLABLE, and ON DELETE SET NULL. Goods arrive before paperwork, so a receipt
-- must be recordable with no invoice at all (FR-11); and deleting an invoice must
-- not delete the fact that goods physically arrived.
alter table public.raw_materials_received
  add column if not exists invoice_line_id uuid
    references public.invoice_lines(id) on delete set null;

create index if not exists raw_materials_received_invoice_line_idx
  on public.raw_materials_received (invoice_line_id);

comment on column public.raw_materials_received.invoice_line_id is
  'Optional link to the invoice line this delivery was billed under. Null when the '
  'goods arrived without paperwork, which is normal and must stay recordable.';

-- ════════════════════════════════════════════════════════════════════════════
-- 5. Dispatch — the outbound delivery log
--
-- The business had NO record of where finished goods went: the only trace was a
-- carton count on the packaging record. This is the delivery history.
-- ════════════════════════════════════════════════════════════════════════════

create table public.dispatches (
  id             uuid primary key default gen_random_uuid(),

  -- Dated by the day the SHIFT STARTED, like every other record in this schema.
  -- A Night dispatch released at 05:00 belongs to the previous day. The app uses
  -- shiftDateFor() to default this; see lib/shift-config.ts.
  date           date not null,
  shift          public.shift_type not null,

  vehicle_reg    text not null check (length(trim(vehicle_reg)) > 0),
  driver_name    text not null check (length(trim(driver_name)) > 0),
  destination    text not null check (length(trim(destination)) > 0),

  -- The document number the business will search by.
  waybill_number text,

  released_by    text,
  remarks        text,
  user_id        uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- PARTIAL unique index, not a plain UNIQUE constraint. Many dispatches have no
-- waybill and they are not duplicates of one another; this constrains only the
-- rows that actually carry a number.
create unique index dispatches_waybill_uidx
  on public.dispatches (waybill_number)
  where waybill_number is not null;

create index dispatches_date_idx        on public.dispatches (date desc);
create index dispatches_vehicle_idx     on public.dispatches (vehicle_reg);
create index dispatches_driver_idx      on public.dispatches (driver_name);
create index dispatches_destination_idx on public.dispatches (destination);

create trigger dispatches_set_updated_at
  before update on public.dispatches
  for each row execute function public.set_updated_at();

comment on table public.dispatches is
  'Outbound delivery log: which vehicle, which driver, to where, under which waybill. '
  'Deliberately NOT wired into finished_goods_stock() — see PRD.md §3.3.';

-- ── Dispatch lines: cartons per product on one load ─────────────────────────
create table public.dispatch_lines (
  id          uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references public.dispatches(id) on delete cascade,
  product     public.product_type not null,

  -- > 0, not >= 0: a zero line is noise, and FR-13 requires at least one real
  -- quantity per dispatch.
  cartons     numeric(12, 2) not null check (cartons > 0),

  created_at  timestamptz not null default now(),

  -- One line per product per load, so a quantity cannot be entered twice.
  constraint dispatch_lines_dispatch_product_key unique (dispatch_id, product)
);

create index dispatch_lines_dispatch_idx on public.dispatch_lines (dispatch_id);
create index dispatch_lines_product_idx  on public.dispatch_lines (product);

comment on table public.dispatch_lines is
  'Cartons per product on one dispatch. cartons > 0 and unique per (dispatch, product).';

-- ════════════════════════════════════════════════════════════════════════════
-- 6. RLS
--
-- Read: can_read_stock() — includes the read-only procurement office.
-- Write: can_write_stock() — excludes it.
--
-- No UPDATE and no DELETE policy for authenticated users on any of these four
-- tables. Edit/delete of a submitted record is not a feature of this system
-- (PRD.md §3.2); a mistake is corrected by a compensating entry. Admins can still
-- correct data through the service role, which bypasses RLS.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.invoices       enable row level security;
alter table public.invoice_lines  enable row level security;
alter table public.dispatches     enable row level security;
alter table public.dispatch_lines enable row level security;

create policy "invoices_read"   on public.invoices for select to authenticated
  using (public.can_read_stock());
create policy "invoices_insert" on public.invoices for insert to authenticated
  with check (public.can_write_stock());

create policy "invoice_lines_read"   on public.invoice_lines for select to authenticated
  using (public.can_read_stock());
create policy "invoice_lines_insert" on public.invoice_lines for insert to authenticated
  with check (public.can_write_stock());

create policy "dispatches_read"   on public.dispatches for select to authenticated
  using (public.can_read_stock());
create policy "dispatches_insert" on public.dispatches for insert to authenticated
  with check (public.can_write_stock());

create policy "dispatch_lines_read"   on public.dispatch_lines for select to authenticated
  using (public.can_read_stock());
create policy "dispatch_lines_insert" on public.dispatch_lines for insert to authenticated
  with check (public.can_write_stock());

-- Admin full control, for corrections. Mirrors consumable_stock in 0004.
create policy "invoices_admin"       on public.invoices       for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "invoice_lines_admin"  on public.invoice_lines  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "dispatches_admin"     on public.dispatches     for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "dispatch_lines_admin" on public.dispatch_lines for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. Write a dispatch and its lines in ONE transaction
--
-- FR-13 requires at least one line with a positive quantity. Over the Data API a
-- header insert followed by a lines insert is TWO transactions, so a failure
-- between them leaves a dispatch with no lines — a delivery of nothing, which
-- then shows up in every total as a zero-carton row nobody can explain.
--
-- Same reasoning as save_recipes() in 0007: when a rule spans more than one
-- statement, the rule belongs in an RPC.
--
-- SECURITY DEFINER with the gate INSIDE, and no relaxation for a null auth.uid():
-- anon has no uid either, and the anon key ships in the browser bundle.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.record_dispatch(
  p_date        date,
  p_shift       public.shift_type,
  p_vehicle     text,
  p_driver      text,
  p_destination text,
  p_lines       jsonb,               -- [{"product":"Bitters","cartons":120}, …]
  p_waybill     text default null,
  p_remarks     text default null
)
returns public.dispatches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row   public.dispatches;
  v_line  jsonb;
  v_count int := 0;
begin
  if not public.can_write_stock() then
    raise exception 'insufficient_privilege: recording a dispatch requires the stock, manager or admin role'
      using errcode = '42501';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'a dispatch needs at least one product line'
      using errcode = '22023';
  end if;

  insert into public.dispatches
      (date, shift, vehicle_reg, driver_name, destination, waybill_number, remarks,
       released_by, user_id)
  values
      (p_date, p_shift, trim(p_vehicle), trim(p_driver), trim(p_destination),
       nullif(trim(coalesce(p_waybill, '')), ''), p_remarks,
       (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
       auth.uid())
  returning * into v_row;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    -- Skipped rather than rejected: a form offering both products sends a zero for
    -- the one not loaded, and that is not an error. The v_count check below is what
    -- enforces FR-13, so an all-zero submission still fails.
    if coalesce((v_line ->> 'cartons')::numeric, 0) > 0 then
      insert into public.dispatch_lines (dispatch_id, product, cartons)
      values (v_row.id, (v_line ->> 'product')::public.product_type,
              (v_line ->> 'cartons')::numeric);
      v_count := v_count + 1;
    end if;
  end loop;

  if v_count = 0 then
    raise exception 'a dispatch needs at least one product with cartons greater than zero'
      using errcode = '22023';
  end if;

  return v_row;
end;
$$;

comment on function public.record_dispatch(date, public.shift_type, text, text, text, jsonb, text, text) is
  'Insert a dispatch and its product lines in one transaction. Enforces FR-13 '
  '(at least one positive line) and is gated to can_write_stock().';

-- Postgres grants EXECUTE to PUBLIC on every new function, and anon is in PUBLIC,
-- so omitting anon from the GRANT would do nothing. Revoke first, always.
revoke execute on function public.record_dispatch(date, public.shift_type, text, text, text, jsonb, text, text)
  from public, anon;
grant execute on function public.record_dispatch(date, public.shift_type, text, text, text, jsonb, text, text)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 8. Save an invoice with its lines in one transaction
--
-- Same reasoning as record_dispatch: an invoice with no lines is not a usable
-- record, and FR-9's warn-don't-block comparison needs both halves present.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.record_invoice(
  p_supplier       text,
  p_invoice_number text,
  p_invoice_date   date,
  p_lines          jsonb,   -- [{"material_type":"tax_stamp","description":…,
                            --   "quantity":10,"unit":"boxes","unit_cost":250}, …]
  p_currency       text    default 'GHS',
  p_declared_total numeric default null,
  p_remarks        text    default null
)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row  public.invoices;
  v_line jsonb;
  v_n    int := 0;
  v_ord  smallint := 0;
begin
  if not public.can_write_stock() then
    raise exception 'insufficient_privilege: recording an invoice requires the stock, manager or admin role'
      using errcode = '42501';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'an invoice needs at least one line'
      using errcode = '22023';
  end if;

  insert into public.invoices
      (supplier, invoice_number, invoice_date, currency, declared_total, remarks,
       recorded_by, user_id)
  values
      (trim(p_supplier), trim(p_invoice_number), p_invoice_date,
       upper(coalesce(nullif(trim(p_currency), ''), 'GHS')),
       p_declared_total, p_remarks,
       (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
       auth.uid())
  returning * into v_row;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    if coalesce((v_line ->> 'quantity')::numeric, 0) > 0 then
      insert into public.invoice_lines
          (invoice_id, material_type, description, quantity, unit, unit_cost, display_order)
      values
          (v_row.id,
           v_line ->> 'material_type',
           nullif(v_line ->> 'description', ''),
           (v_line ->> 'quantity')::numeric,
           coalesce(nullif(v_line ->> 'unit', ''), 'pcs'),
           coalesce((v_line ->> 'unit_cost')::numeric, 0),
           v_ord);
      v_n := v_n + 1;
      v_ord := v_ord + 1;
    end if;
  end loop;

  if v_n = 0 then
    raise exception 'an invoice needs at least one line with a quantity greater than zero'
      using errcode = '22023';
  end if;

  -- NOTE: no check that the line sum equals declared_total. That comparison is a
  -- WARNING in the UI, never a rejection (FR-9) — see the declared_total comment.
  return v_row;
end;
$$;

comment on function public.record_invoice(text, text, date, jsonb, text, numeric, text) is
  'Insert an invoice and its lines in one transaction. Does NOT enforce that the '
  'line sum equals declared_total — that mismatch is warned about, not blocked (FR-9).';

revoke execute on function public.record_invoice(text, text, date, jsonb, text, numeric, text)
  from public, anon;
grant execute on function public.record_invoice(text, text, date, jsonb, text, numeric, text)
  to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 9. Dispatch aggregation for the stock dashboard
--
-- Cartons out per product over a window, plus the per-vehicle / per-driver /
-- per-destination breakdowns FR-16 and FR-19 ask for.
--
-- A plain view would bypass base-table RLS unless security_invoker is on, and the
-- grants safety gate in 0005 warns about views for exactly that reason. These are
-- SECURITY INVOKER functions (the default): the caller's own RLS applies, so a
-- role that cannot read dispatches gets nothing here either.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.dispatch_totals(p_from date, p_to date)
returns table (product public.product_type, cartons numeric, loads bigint)
language sql
stable
set search_path = public
as $$
  select l.product,
         coalesce(sum(l.cartons), 0)      as cartons,
         count(distinct d.id)              as loads
  from public.dispatch_lines l
  join public.dispatches d on d.id = l.dispatch_id
  where d.date between p_from and p_to
  group by l.product;
$$;

comment on function public.dispatch_totals(date, date) is
  'Cartons dispatched per product in a date window. SECURITY INVOKER — the '
  'caller''s RLS applies.';

create or replace function public.dispatch_breakdown(p_from date, p_to date, p_dimension text)
returns table (label text, cartons numeric, loads bigint)
language plpgsql
stable
set search_path = public
as $$
begin
  -- Whitelisted, not interpolated: p_dimension picks a column, and building SQL
  -- from a caller-supplied string is how an injection gets in.
  if p_dimension not in ('vehicle', 'driver', 'destination') then
    raise exception 'dimension must be one of vehicle, driver, destination'
      using errcode = '22023';
  end if;

  return query
    select case p_dimension
             when 'vehicle'     then d.vehicle_reg
             when 'driver'      then d.driver_name
             else                    d.destination
           end as label,
           coalesce(sum(l.cartons), 0) as cartons,
           count(distinct d.id)         as loads
    from public.dispatches d
    join public.dispatch_lines l on l.dispatch_id = d.id
    where d.date between p_from and p_to
    group by 1
    order by 2 desc;
end;
$$;

comment on function public.dispatch_breakdown(date, date, text) is
  'Cartons dispatched grouped by vehicle, driver or destination. The dimension is '
  'whitelisted, never interpolated into SQL.';

-- These read through the caller's RLS, so anon reaching them would still see
-- nothing — but the revoke stays for consistency with every other function here.
revoke execute on function public.dispatch_totals(date, date)            from public, anon;
revoke execute on function public.dispatch_breakdown(date, date, text)   from public, anon;
grant  execute on function public.dispatch_totals(date, date)            to authenticated, service_role;
grant  execute on function public.dispatch_breakdown(date, date, text)   to authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 10. Grants
--
-- Table grants are broad because RLS is the real boundary (the Supabase model).
-- Every table above has RLS enabled with explicit policies, asserted in
-- supabase/tests/06_stock_separation.sql.
--
-- SELECT and INSERT only for `authenticated`: with no UPDATE/DELETE policy a
-- grant would be inert, but withholding it means an attempted edit fails with a
-- clear privilege error rather than silently affecting zero rows.
--
-- THE REVOKE IS NOT DECORATION. 0005 ends with
--     alter default privileges in schema public
--       grant select, insert, update, delete on tables to anon, authenticated, service_role;
-- so every table created afterwards — including these four — is granted UPDATE and
-- DELETE automatically, before this file says a word. Granting select+insert here
-- would therefore have been a no-op that LOOKED like a restriction. The revoke is
-- what actually makes these tables append-only, and 06_stock_separation.sql asserts
-- it with has_table_privilege rather than trusting the grant statements above.
-- ════════════════════════════════════════════════════════════════════════════

grant select, insert on public.invoices       to authenticated;
grant select, insert on public.invoice_lines  to authenticated;
grant select, insert on public.dispatches     to authenticated;
grant select, insert on public.dispatch_lines to authenticated;

revoke update, delete on public.invoices       from authenticated, anon;
revoke update, delete on public.invoice_lines  from authenticated, anon;
revoke update, delete on public.dispatches     from authenticated, anon;
revoke update, delete on public.dispatch_lines from authenticated, anon;

-- anon picks up SELECT and INSERT from the same default privileges. Every policy on
-- these tables is `to authenticated`, so RLS already yields it nothing — but a
-- privilege that is only harmless because a policy happens to be written correctly
-- is one policy edit away from being a hole. None of this data is public.
revoke all on public.invoices       from anon;
revoke all on public.invoice_lines  from anon;
revoke all on public.dispatches     from anon;
revoke all on public.dispatch_lines from anon;

grant select, insert, update, delete on public.invoices       to service_role;
grant select, insert, update, delete on public.invoice_lines  to service_role;
grant select, insert, update, delete on public.dispatches     to service_role;
grant select, insert, update, delete on public.dispatch_lines to service_role;

revoke execute on function public.can_write_stock() from public, anon;
revoke execute on function public.can_read_stock()  from public, anon;
grant  execute on function public.can_write_stock() to authenticated, service_role;
grant  execute on function public.can_read_stock()  to authenticated, service_role;
