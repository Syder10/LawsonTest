-- ============================================================================
-- 0005_ledger_and_grants.sql
-- The DERIVED STOCK LEDGER + the Data API grants. Run LAST.
--
-- Model
-- -----
-- Supervisors record only movements (received/used) per shift, in stock_records
-- (materials) and blowing_daily_records (preforms). Tax stamps and cartons are
-- also derived: received via raw_materials_received, consumed via
-- packaging_daily_records × packaging_bom (cartons produced × rate). Management/
-- procurement set the baseline and correct drift via `stock_counts` (a physical
-- count that re-anchors the ledger and records the counted-vs-computed variance).
--
-- A balance at any point in time is:
--     (counted_qty of the latest stock_count at/-before that point, else 0)
--   + SUM(received - used) for every movement strictly after that count and
--     up to the point,
-- where "point" is ordered chronologically by (date, shift_rank) with
-- Morning < Afternoon < Night. Because balances are chained from the ordered
-- movement log rather than a frozen stored "opening", a late / out-of-order
-- shift submission self-heals: it slots into its true position and every later
-- balance recomputes automatically.
--
-- All reads run through SECURITY DEFINER functions: continuity spans multiple
-- supervisors' rows, which RLS correctly hides from any one supervisor. The
-- functions expose only computed balances, never other users' raw rows.
-- ============================================================================

-- ── Finished-goods on hand, derived ─────────────────────────────────────────
-- Σ produced − Σ loaded per product. Replaces the old stored packaging_live_stocks
-- running total, which drifted on edits and could go negative. Cumulative /
-- all-time (a warehouse balance), independent of any dashboard date filter.
create or replace function public.finished_goods_stock()
returns table (product public.product_type, available numeric, total_produced numeric, total_loaded numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.product,
         coalesce(sum(p.quantity_cartons_produced), 0) - coalesce(sum(p.quantity_cartons_loaded), 0) as available,
         coalesce(sum(p.quantity_cartons_produced), 0) as total_produced,
         coalesce(sum(p.quantity_cartons_loaded), 0)   as total_loaded
  from public.packaging_daily_records p
  group by p.product;
$$;

grant execute on function public.finished_goods_stock() to authenticated;

-- Chronological rank of a shift within a day (Morning -> Afternoon -> Night).
-- Mirrors the Shift order in lib/shift-config.ts (SHIFT_RANK).
create or replace function public.shift_rank(s public.shift_type)
returns int
language sql
immutable
as $$
  select case s
           when 'Morning'   then 1
           when 'Afternoon' then 2
           when 'Night'     then 3
         end;
$$;

-- ── stock_counts: management baseline + reconciliation anchors ───────────────
-- Append-only (like raw_materials_received). `computed_qty` snapshots what the
-- ledger *thought* the balance was at the count point; `variance` (generated) is
-- the shrinkage/surplus signal. `kind` distinguishes the day-one baseline from a
-- later reconciliation. A null `shift` means the count applies at end-of-day.
create table public.stock_counts (
  id           uuid primary key default gen_random_uuid(),
  date         date not null,
  shift        public.shift_type,
  material     text not null references public.stock_materials(code),
  product      public.product_type,                                        -- labels / caramel
  variant      text references public.herb_types(name) on update cascade,  -- herb
  counted_qty  numeric not null check (counted_qty >= 0),
  computed_qty numeric not null default 0,
  variance     numeric generated always as (counted_qty - computed_qty) stored,
  kind         text not null default 'reconciliation' check (kind in ('baseline','reconciliation')),
  note         text,
  counted_by   text,
  user_id      uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index stock_counts_lookup_idx on public.stock_counts (material, product, variant, date desc);

alter table public.stock_counts enable row level security;

-- Supervisors don't reconcile; only procurement/managers/admins can see counts.
create policy "stock_counts_select_procurement" on public.stock_counts for select to authenticated
  using (public.is_procurement_staff());

-- Normal writes go through the SECURITY DEFINER record_stock_count() RPC (which
-- snapshots computed_qty). Direct table writes are admin-only (corrections).
create policy "stock_counts_admin_write" on public.stock_counts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── Core balance computation ────────────────────────────────────────────────
-- Balance for (material, product, variant) at the point (p_date, p_rank).
-- p_strict = true  -> the point is EXCLUSIVE (used for "opening into a shift").
-- p_strict = false -> the point is INCLUSIVE (used for "remaining as of a date").
create or replace function public.stock_balance_core(
  p_material text,
  p_product  public.product_type,
  p_variant  text,
  p_date     date,
  p_rank     int,
  p_strict   boolean
) returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a_base  numeric := 0;
  a_date  date    := null;
  a_rank  int     := null;
  v_total numeric;
begin
  -- Latest anchor (baseline/reconciliation) at or before the query point.
  select c.counted_qty, c.date, coalesce(public.shift_rank(c.shift), 3)
    into a_base, a_date, a_rank
  from public.stock_counts c
  where c.material = p_material
    and (p_product is null or c.product = p_product)
    and (p_variant is null or c.variant = p_variant)
    and (
         (p_strict     and (c.date, coalesce(public.shift_rank(c.shift), 3)) <  (p_date, p_rank))
      or (not p_strict and (c.date, coalesce(public.shift_rank(c.shift), 3)) <= (p_date, p_rank))
    )
  order by c.date desc, coalesce(public.shift_rank(c.shift), 3) desc, c.created_at desc
  limit 1;

  -- Sum movements up to the query point and strictly after the anchor.
  select coalesce(a_base, 0) + coalesce(sum(m.net), 0)
    into v_total
  from (
    select s.date as d, public.shift_rank(s.shift) as r,
           coalesce(s.quantity_received, 0) - coalesce(s.quantity_used, 0) as net
    from public.stock_records s
    where s.material = p_material
      and (p_product is null or s.product = p_product)
      and (p_variant is null or s.variant = p_variant)
    union all
    select b.date, public.shift_rank(b.shift),
           coalesce(b.quantity_received_bags, 0) - coalesce(b.preforms_used_bags, 0)
    from public.blowing_daily_records b
    where p_material = 'preform'
    union all
    -- tax_stamp / carton RECEIVED events (raw_materials_received). Deliveries
    -- carry no shift → rank as end-of-day (3).
    select r.date, 3,
           case when p_material = 'tax_stamp' then coalesce(r.stamp_total_pcs, 0)
                else coalesce(r.carton_total_pcs, 0) end
    from public.raw_materials_received r
    where (p_material = 'tax_stamp' and r.material_type = 'tax_stamp')
       or (p_material = 'carton' and r.material_type = 'carton_' || lower(p_product::text))
    union all
    -- tax_stamp / carton CONSUMED, derived from packaging production × BOM
    -- (Bitters 9 / Ginger 6 stamps per carton; 1 carton box per carton). Basis
    -- is cartons PRODUCED. tax_stamp is consumed across all products; carton is
    -- per-product.
    select pk.date, public.shift_rank(pk.shift),
           - (coalesce(pk.quantity_cartons_produced, 0) *
              case when p_material = 'tax_stamp' then bom.stamps_per_carton else bom.cartons_per_carton end)
    from public.packaging_daily_records pk
    join public.packaging_bom bom on bom.product = pk.product
    where p_material in ('tax_stamp', 'carton')
      and (p_material = 'tax_stamp' or pk.product = p_product)
  ) m
  where (
         (p_strict     and (m.d, m.r) <  (p_date, p_rank))
      or (not p_strict and (m.d, m.r) <= (p_date, p_rank))
    )
    and (a_date is null or (m.d, m.r) > (a_date, a_rank));

  return v_total;
end;
$$;

-- Balance carried INTO (p_date, p_shift) — i.e. the opening for that shift.
create or replace function public.stock_opening(
  p_material text,
  p_date     date,
  p_shift    public.shift_type,
  p_product  public.product_type default null,
  p_variant  text default null
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.stock_balance_core(p_material, p_product, p_variant, p_date, public.shift_rank(p_shift), true);
$$;

-- Balance as of the END of p_date (all shifts that day) — "current remaining".
create or replace function public.stock_remaining_asof(
  p_material text,
  p_date     date,
  p_product  public.product_type default null,
  p_variant  text default null
) returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.stock_balance_core(p_material, p_product, p_variant, p_date, 3, false);
$$;

-- Per-shift ledger rows with running opening/remaining, for history / export /
-- day-detail. Ordered chronologically.
create or replace function public.stock_ledger(
  p_material text,
  p_from     date,
  p_to       date,
  p_product  public.product_type default null,
  p_variant  text default null
) returns table (
  date      date,
  shift     public.shift_type,
  received  numeric,
  used      numeric,
  opening   numeric,
  remaining numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with mov as (
    select s.date as d, s.shift as sh,
           coalesce(s.quantity_received, 0) as rec, coalesce(s.quantity_used, 0) as usd
    from public.stock_records s
    where s.material = p_material
      and (p_product is null or s.product = p_product)
      and (p_variant is null or s.variant = p_variant)
    union all
    select b.date, b.shift,
           coalesce(b.quantity_received_bags, 0), coalesce(b.preforms_used_bags, 0)
    from public.blowing_daily_records b
    where p_material = 'preform'
  )
  select m.d, m.sh, m.rec, m.usd,
         public.stock_opening(p_material, m.d, m.sh, p_product, p_variant) as opening,
         public.stock_opening(p_material, m.d, m.sh, p_product, p_variant) + m.rec - m.usd as remaining
  from mov m
  where m.d between p_from and p_to
  order by m.d, public.shift_rank(m.sh);
$$;

-- ── Reconciliation write ─────────────────────────────────────────────────────
-- Record a baseline or reconciliation count. Snapshots the computed balance at
-- the count point (so variance is captured), inserts the anchor, returns the row
-- (incl. generated variance). Gated to procurement/manager/admin.
create or replace function public.record_stock_count(
  p_material text,
  p_date     date,
  p_counted  numeric,
  p_shift    public.shift_type default null,
  p_product  public.product_type default null,
  p_variant  text default null,
  p_kind     text default 'reconciliation',
  p_note     text default null
) returns public.stock_counts
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_computed numeric;
  v_row      public.stock_counts;
begin
  if not public.is_procurement_staff() then
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

grant execute on function public.shift_rank(public.shift_type) to authenticated;
grant execute on function public.stock_balance_core(text, public.product_type, text, date, int, boolean) to authenticated;
grant execute on function public.stock_opening(text, date, public.shift_type, public.product_type, text) to authenticated;
grant execute on function public.stock_remaining_asof(text, date, public.product_type, text) to authenticated;
grant execute on function public.stock_ledger(text, date, date, public.product_type, text) to authenticated;
grant execute on function public.record_stock_count(text, date, numeric, public.shift_type, public.product_type, text, text, text) to authenticated;

-- ============================================================================
-- Data API grants
--
-- THE FAILURE THIS FIXES
-- ----------------------
-- Every request through PostgREST failing with:
--     ERROR 42501: permission denied for schema public     (user: authenticator)
-- while the SQL editor works perfectly — because the editor connects as the
-- schema OWNER, which needs no grants.
--
-- Cause: `drop schema public cascade; create schema public;` (the usual way to
-- reset a database) destroys the grants Supabase ships by default and does NOT
-- restore them. `auth` is a separate schema, so logins survive — which is why the
-- symptom looks like "my profile disappeared" rather than "the API is dead".
--
-- WHY GRANTING TABLE ACCESS IS SAFE HERE
-- --------------------------------------
-- This is Supabase's model: `anon` and `authenticated` hold table privileges and
-- **RLS is the actual security boundary**. Every table in `public` has RLS
-- enabled with policies scoped `to authenticated`, so `anon` reaches zero rows
-- and a supervisor reaches only their own. The DO block REFUSES to grant
-- anything if that assumption is ever violated.
-- ============================================================================

do $$
declare
  v_norls text;
  v_views text;
begin
  -- Non-Supabase environments (a bare Postgres) have none of these roles.
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise notice '0005: Supabase API roles absent — skipping grants (non-Supabase environment).';
    return;
  end if;

  -- SAFETY GATE: these grants rely on RLS for security. If any table in public
  -- lacks RLS, granting would expose it wholesale — refuse instead.
  select string_agg(c.relname, ', ' order by c.relname) into v_norls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  if v_norls is not null then
    raise exception
      '0005 refusing to grant API access: these public tables have no RLS: %. '
      'Enable RLS (and add policies) on them first, or they would be fully readable '
      'by any holder of the public anon key.', v_norls;
  end if;

  -- Views do not have RLS of their own and, unless created WITH
  -- (security_invoker = on), run as their owner and bypass the base tables' RLS.
  -- There are none today; warn loudly if that ever changes.
  select string_agg(c.relname, ', ' order by c.relname) into v_views
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v';

  if v_views is not null then
    raise warning
      '0005: public contains view(s): %. Views bypass base-table RLS unless created '
      'WITH (security_invoker = on). Verify each before relying on these grants.', v_views;
  end if;

  -- ── Schema usage — without this NOTHING through PostgREST works ────────────
  grant usage on schema public to postgres, anon, authenticated, service_role;

  -- ── Existing objects ──────────────────────────────────────────────────────
  grant select, insert, update, delete on all tables in schema public
    to anon, authenticated, service_role;
  grant usage, select on all sequences in schema public
    to anon, authenticated, service_role;
  grant execute on all functions in schema public
    to authenticated, service_role;

  -- ── Future objects created by this role ───────────────────────────────────
  alter default privileges in schema public
    grant select, insert, update, delete on tables to anon, authenticated, service_role;
  alter default privileges in schema public
    grant usage, select on sequences to anon, authenticated, service_role;
  alter default privileges in schema public
    grant execute on functions to authenticated, service_role;

  raise notice '0005: API grants restored for anon, authenticated, service_role.';
end $$;

-- ── Lock down the SECURITY DEFINER data functions ────────────────────────────
-- NOT redundant with the grants above. PostgreSQL grants EXECUTE on every new
-- function to PUBLIC by default, and `anon` is a member of PUBLIC — so simply
-- omitting anon from the GRANT above does nothing. These functions are SECURITY
-- DEFINER and therefore bypass RLS by design, and the anon key is embedded in the
-- browser bundle. Without the REVOKE below, anyone who reads the JavaScript can
-- call them and read live stock balances, finished-goods on hand, and the full
-- movement ledger.
--
-- Verified reachable-as-anon before this was added, which is why it is here.
do $$
declare
  fn text;
  guarded text[] := array[
    'public.stock_balance_core(text, public.product_type, text, date, int, boolean)',
    'public.stock_opening(text, date, public.shift_type, public.product_type, text)',
    'public.stock_remaining_asof(text, date, public.product_type, text)',
    'public.stock_ledger(text, date, date, public.product_type, text)',
    'public.finished_goods_stock()',
    'public.record_stock_count(text, date, numeric, public.shift_type, public.product_type, text, text, text)'
  ];
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    return;
  end if;

  foreach fn in array guarded loop
    begin
      execute format('revoke execute on function %s from public', fn);
      execute format('revoke execute on function %s from anon', fn);
      execute format('grant execute on function %s to authenticated, service_role', fn);
    exception when undefined_function then
      raise warning '0005: function %s not found — skipped', fn;
    end;
  end loop;

  raise notice '0005: SECURITY DEFINER stock functions restricted to authenticated + service_role.';
end $$;
