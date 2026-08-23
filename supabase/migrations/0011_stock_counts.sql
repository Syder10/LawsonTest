-- ============================================================================
-- 0011_stock_counts.sql
-- The DERIVED STOCK LEDGER: management baselines/reconciliations + the functions
-- that compute opening/remaining balances on read.
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
