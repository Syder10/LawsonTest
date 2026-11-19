-- ============================================================================
-- 0015_herbs_confidential.sql
--
-- Herb stock is CONFIDENTIAL to the Production Manager (business decision,
-- 2026-11-19). From this migration:
--
--   who                                  herb stock records      herb balances
--   ───────────────────────────────────  ──────────────────────  ─────────────
--   manager                              all                     yes
--   supervisor, Concentrate department   own submissions only    yes (the
--                                        (unchanged)             Herbs Stock form
--                                                                needs its opening)
--   any other supervisor                 own only (unchanged)    no
--   stock, procurement                   NONE (was: all)         no
--   admin                                none (unchanged)        no
--
-- Enforced in the database, not only on screens: RLS on stock_records and
-- stock_counts, and a gate inside the SECURITY DEFINER balance functions, which
-- bypass RLS and would otherwise still answer "how many herb sacks are left" to
-- any signed-in caller.
--
-- Herb NAMES (herb_types) become readable by the same herb readers plus admin,
-- who maintains the list. Admin sees names only, never stock.
--
-- Self-contained (own helpers and grants) so it can be applied alone, following
-- 0006/0007. Nothing else in the policies it replaces is changed.
-- ============================================================================

-- ── Who may see herb stock ───────────────────────────────────────────────────
-- 'Concentrate' is the only department whose record type writes herb stock
-- ("Herbs Stock" in lib/domain/record-types.ts — a unit test pins the two together).
create or replace function public.can_read_herbs()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.role = 'manager'
         or (p.role = 'supervisor' and p.department = 'Concentrate')
       from public.profiles p
      where p.id = auth.uid()),
    false
  );
$$;

revoke execute on function public.can_read_herbs() from public, anon;
grant execute on function public.can_read_herbs() to authenticated, service_role;

comment on function public.can_read_herbs() is
  'Herb stock is confidential to the Production Manager (manager role) and the Concentrate '
  'supervisors who record it (0015).';

-- Gate for the SECURITY DEFINER ledger functions. A call with no signed-in user is
-- the server/owner path (anon cannot execute these functions — 0005), so it passes.
create or replace function public.herb_ledger_allowed(p_material text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_material is distinct from 'herb' or auth.uid() is null or public.can_read_herbs();
$$;

revoke execute on function public.herb_ledger_allowed(text) from public, anon;
grant execute on function public.herb_ledger_allowed(text) to authenticated, service_role;

-- ── stock_records: herb rows leave the stock-reading set ────────────────────
-- Same rule as 0010 wrote, with one change: can_read_stock() no longer reaches
-- herb rows. Managers and own-row supervisors are unchanged.
drop policy if exists select_own_or_staff on public.stock_records;
create policy select_own_or_staff on public.stock_records for select to authenticated
  using (
    public.current_user_role() = 'manager'
    or (public.current_user_role() = 'supervisor' and user_id = auth.uid())
    or (public.can_read_stock() and material <> 'herb')
  );

-- ── stock_counts: herb counts follow herb stock ─────────────────────────────
drop policy if exists stock_counts_select_procurement on public.stock_counts;
create policy stock_counts_select_procurement on public.stock_counts for select to authenticated
  using (public.is_procurement_staff() and (material <> 'herb' or public.can_read_herbs()));

-- ── herb_types: names for the people who record or read herbs, and admin ────
drop policy if exists reference_read_herb_types on public.herb_types;
create policy reference_read_herb_types on public.herb_types for select to authenticated
  using (public.can_read_herbs() or public.is_admin());

drop policy if exists herb_types_insert on public.herb_types;
create policy herb_types_insert on public.herb_types for insert to authenticated
  with check (public.can_read_herbs() or public.is_admin());

-- ── Ledger functions: refuse herb balances to anyone outside the herb readers ──
-- stock_balance_core is 0005's body VERBATIM with the gate added first. Every
-- balance (stock_opening, stock_remaining_asof, record_stock_count's snapshot)
-- goes through it, so one gate covers them all.
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
  -- ADDED in 0015: herb stock is confidential (see header).
  if not public.herb_ledger_allowed(p_material) then
    raise exception 'herb stock is confidential to the Production Manager' using errcode = '42501';
  end if;

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

-- stock_ledger reads stock_records directly (as definer, past RLS), so it carries
-- the same gate. 0005's body, with the herb check added to the movement filter.
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
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- ADDED in 0015: herb stock is confidential (see header).
  if not public.herb_ledger_allowed(p_material) then
    raise exception 'herb stock is confidential to the Production Manager' using errcode = '42501';
  end if;

  return query
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
end;
$$;

-- create or replace keeps existing grants; restated so this file stands alone.
revoke execute on function public.stock_balance_core(text, public.product_type, text, date, int, boolean) from public, anon;
grant execute on function public.stock_balance_core(text, public.product_type, text, date, int, boolean) to authenticated, service_role;
revoke execute on function public.stock_ledger(text, date, date, public.product_type, text) from public, anon;
grant execute on function public.stock_ledger(text, date, date, public.product_type, text) to authenticated, service_role;
