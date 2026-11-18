-- ============================================================================
-- supabase/tests/04_dept_scope.sql
--
-- Proves the DATA side of department scoping.
--
-- The bug being guarded against: a single `.eq("department", …)` applied to every
-- table meant selecting one department zeroed out every other department's tables
-- while leaving stock balances global — so 4 of the 5 departments showed a
-- half-empty dashboard, and materials that were actively being consumed reported
-- "no usage" and therefore "no risk".
--
-- These tests assert the facts the department-scoped route relies on:
--   1. each department's rows are reachable by its own department value
--   2. a department filter applied to ANOTHER department's table yields nothing
--      (which is exactly why the old shared filter was wrong)
--   3. per-department material balances are non-global and correct
-- ============================================================================

-- Fixtures across three departments on the same date + shift.
insert into public.blowing_daily_records
  (date, shift, department, total_produced, waste_pcs, preforms_used_bags, bottles_given_out)
values ('2026-10-01', 'Morning', 'Blowing', 10000, 400, 25, 9500);

insert into public.filling_line_daily_records
  (date, shift, department, product, total_production, bottles_wasted, bottles_rejected)
values ('2026-10-01', 'Morning', 'Filling Line', 'Bitters', 6000, 120, 30);
insert into public.filling_line_daily_records
  (date, shift, department, product, total_production, bottles_wasted, bottles_rejected)
values ('2026-10-01', 'Morning', 'Filling Line', 'Ginger', 3000, 60, 10);

insert into public.packaging_daily_records
  (date, shift, department, product, quantity_cartons_produced, number_cartons_wasted, quantity_cartons_loaded)
values ('2026-10-01', 'Morning', 'Packaging', 'Bitters', 500, 5, 400);

insert into public.concentrate_alcohol_records
  (date, shift, department, number_tanks_70, alcohol_used_70_litres, water_70_litres)
values ('2026-10-01', 'Morning', 'Concentrate', 2, 700, 300);

-- ── 1. Each department reaches its own rows ─────────────────────────────────
do $$
declare blown numeric; filled numeric; cartons numeric; conc numeric;
begin
  select sum(total_produced) into blown
    from public.blowing_daily_records where department = 'Blowing' and date = '2026-10-01';
  select sum(total_production) into filled
    from public.filling_line_daily_records where department = 'Filling Line' and date = '2026-10-01';
  select sum(quantity_cartons_produced) into cartons
    from public.packaging_daily_records where department = 'Packaging' and date = '2026-10-01';
  select sum(total_alcohol_used_litres) into conc
    from public.concentrate_alcohol_records where department = 'Concentrate' and date = '2026-10-01';

  assert blown   = 10000, format('Blowing bottles expected 10000, got %s', blown);
  assert filled  =  9000, format('Filling bottles expected 9000, got %s', filled);
  assert cartons =   500, format('Packaging cartons expected 500, got %s', cartons);
  assert conc    =   700, format('Concentrate alcohol expected 700, got %s', conc);
  raise notice 'PASS each department reaches its own rows';
end $$;

-- ── 2. Why one shared department filter was wrong ────────────────────────────
-- Applying 'Blowing' to the packaging table returns NOTHING. The old route did
-- exactly this to every table at once, which is how a Blowing selection produced
-- zero cartons, zero alcohol, zero caps and zero labels.
do $$
declare n int;
begin
  select count(*) into n from public.packaging_daily_records where department = 'Blowing';
  assert n = 0, format('packaging rows under department=Blowing expected 0, got %s', n);

  select count(*) into n from public.blowing_daily_records where department = 'Packaging';
  assert n = 0, format('blowing rows under department=Packaging expected 0, got %s', n);

  raise notice 'PASS a cross-department filter yields nothing (the old bug, demonstrated)';
end $$;

-- ── 3. Generated columns the KPIs depend on ─────────────────────────────────
do $$
declare net numeric; total numeric;
begin
  select final_production into net
    from public.blowing_daily_records where date = '2026-10-01' and department = 'Blowing';
  assert net = 9600, format('final_production expected 10000-400=9600, got %s', net);

  select total_alcohol_used_litres into total
    from public.concentrate_alcohol_records where date = '2026-10-01' and department = 'Concentrate';
  assert total = 700, format('total_alcohol_used_litres expected 700, got %s', total);

  raise notice 'PASS generated columns backing the KPIs compute correctly';
end $$;

-- ── 4. Per-department material balances are real, not global ─────────────────
-- Preforms belong to Blowing (movements in blowing_daily_records); caps belong to
-- Filling Line (movements in stock_records). Each must balance independently.
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-09-30', null, 'preform', 1000, 0, 'baseline');
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-09-30', null, 'caps', 50000, 0, 'baseline');

insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-10-01', 'Morning', 'Filling Line', 'caps', 0, 9000);

do $$
declare pre numeric; caps numeric;
begin
  -- 1000 baseline − 25 used by Blowing
  pre := public.stock_remaining_asof('preform', '2026-10-01');
  -- 50000 baseline − 9000 used by Filling Line
  caps := public.stock_remaining_asof('caps', '2026-10-01');

  assert pre  =   975, format('preform remaining expected 975, got %s', pre);
  assert caps = 41000, format('caps remaining expected 41000, got %s', caps);
  raise notice 'PASS per-department material balances are independent and correct';
end $$;

-- ── 5. Shared record type stays per-department ───────────────────────────────
-- concentrate_alcohol_records is filed by BOTH Concentrate and Alcohol and
-- Blending, so a department-scoped read must not pick up the other's row.
insert into public.concentrate_alcohol_records
  (date, shift, department, number_tanks_70, alcohol_used_70_litres, water_70_litres)
values ('2026-10-01', 'Morning', 'Alcohol and Blending', 5, 1500, 600);

do $$
declare c numeric; ab numeric;
begin
  select sum(total_alcohol_used_litres) into c
    from public.concentrate_alcohol_records where department = 'Concentrate' and date = '2026-10-01';
  select sum(total_alcohol_used_litres) into ab
    from public.concentrate_alcohol_records where department = 'Alcohol and Blending' and date = '2026-10-01';

  assert c  =  700, format('Concentrate slice expected 700, got %s', c);
  assert ab = 1500, format('Alcohol and Blending slice expected 1500, got %s', ab);
  raise notice 'PASS the shared record type slices cleanly per department';
end $$;

select '✓ 04_dept_scope.sql — department scoping verified against real rows' as result;
