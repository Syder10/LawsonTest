-- ============================================================================
-- supabase/tests/01_ledger.sql
--
-- Behaviour tests for the DERIVED STOCK LEDGER (0005 + 0011).
-- Proves the properties the whole stock model rests on:
--   • out-of-order shift submissions self-heal (no frozen "opening" to corrupt)
--   • a management stock_count re-anchors the balance and records the variance
--   • preforms (blowing_daily_records) and tax stamps / cartons (received events
--     + packaging consumption × BOM) participate in the same derived ledger
--   • editing a packaging record recomputes stamp consumption with no drift
--
-- Runs against a throwaway Postgres with every migration applied.
-- Invoked by scripts/validate-ledger.sh and by .github/workflows/ci.yml.
-- ============================================================================

-- Baseline 200 as of 2026-08-01 (management day-one baseline).
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'alcohol', 200, 0, 'baseline');

-- Out-of-order shift entry on 2026-08-02: Morning, then Night, then LATE Afternoon.
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-08-02','Morning',  'Alcohol and Blending','alcohol',10,60);   -- 200+10-60 = 150
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-08-02','Night',    'Alcohol and Blending','alcohol', 0,30);
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-08-02','Afternoon','Alcohol and Blending','alcohol', 0,30);    -- filed LAST, belongs 2nd

do $$
declare
  o_aft numeric := public.stock_opening('alcohol','2026-08-02','Afternoon');
  o_ngt numeric := public.stock_opening('alcohol','2026-08-02','Night');
  eod   numeric := public.stock_remaining_asof('alcohol','2026-08-02');
begin
  assert o_aft = 150, format('Afternoon opening expected 150, got %s', o_aft);
  assert o_ngt = 120, format('Night opening expected 120, got %s', o_ngt);
  assert eod   =  90, format('End-of-day remaining expected 90, got %s', eod);
  raise notice 'PASS out-of-order self-heal: Aft opens %, Night opens %, EOD %', o_aft, o_ngt, eod;
end $$;

-- Reconciliation: physical count 100 on 2026-08-03 (computed would be 90 → variance +10).
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-03', null, 'alcohol', 100,
        public.stock_remaining_asof('alcohol','2026-08-03'), 'reconciliation');

do $$
declare
  v numeric; r numeric;
begin
  select variance into v from public.stock_counts where date='2026-08-03' and material='alcohol';
  r := public.stock_remaining_asof('alcohol','2026-08-03');
  assert v = 10, format('Variance expected +10, got %s', v);
  assert r = 100, format('Re-anchored remaining expected 100, got %s', r);
  raise notice 'PASS reconciliation: variance % , re-anchored remaining %', v, r;
end $$;

-- Preform ledger via blowing_daily_records (material 'preform').
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'preform', 500, 0, 'baseline');
insert into public.blowing_daily_records (date, shift, department, quantity_received_bags, preforms_used_bags)
values ('2026-08-02','Morning','Blowing', 0, 120);
do $$
declare r numeric := public.stock_remaining_asof('preform','2026-08-02');
begin
  assert r = 380, format('Preform remaining expected 380, got %s', r);
  raise notice 'PASS preform ledger: remaining %', r;
end $$;

-- stock_ledger returns per-shift running balances.
do $$
declare n int;
begin
  select count(*) into n from public.stock_ledger('alcohol','2026-08-01','2026-08-03');
  assert n = 3, format('stock_ledger expected 3 movement rows, got %s', n);
  raise notice 'PASS stock_ledger row count %', n;
end $$;

-- Tax stamps + cartons as a DERIVED ledger.
-- Baseline stamps 100000; receive 90000 more; produce 100 Bitters cartons (×9
-- stamps) + 50 Ginger (×6) = 900+300 = 1200 consumed → 100000+90000-1200 = 188800.
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'tax_stamp', 100000, 0, 'baseline');
insert into public.raw_materials_received (date, material_type, stamp_boxes, stamp_total_pcs)
values ('2026-08-02', 'tax_stamp', 1, 90000);
insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
values ('2026-08-03','Morning','Packaging','Bitters',100);
insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
values ('2026-08-03','Morning','Packaging','Ginger',50);
do $$
declare s numeric := public.stock_remaining_asof('tax_stamp','2026-08-03');
begin
  assert s = 188800, format('tax_stamp remaining expected 188800, got %s', s);
  raise notice 'PASS tax_stamp derived ledger: remaining %', s;
end $$;

-- Cartons are per-product. Baseline 5000 Bitters cartons, produce 100 → 4900.
insert into public.stock_counts (date, shift, material, product, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'carton', 'Bitters', 5000, 0, 'baseline');
do $$
declare c numeric := public.stock_remaining_asof('carton','2026-08-03','Bitters');
begin
  assert c = 4900, format('carton Bitters remaining expected 4900, got %s', c);
  raise notice 'PASS carton derived ledger: remaining %', c;
end $$;

-- Editing a packaging record self-corrects the derived stamp balance (no drift).
update public.packaging_daily_records set quantity_cartons_produced = 200
  where product='Bitters' and date='2026-08-03';
do $$
declare s numeric := public.stock_remaining_asof('tax_stamp','2026-08-03');
begin
  -- now 100000+90000 - (200*9 + 50*6) = 190000 - 2100 = 187900
  assert s = 187900, format('tax_stamp after edit expected 187900, got %s', s);
  raise notice 'PASS stamp self-heal on packaging edit: remaining %', s;
end $$;

select '✓ 01_ledger.sql — all ledger behaviour tests passed' as result;
