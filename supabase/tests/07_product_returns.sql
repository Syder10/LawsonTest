-- Real RLS assertions run as authenticated, using independent fixtures. Roll back
-- the suite so returns never alter another suite's cumulative stock assertions.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('e0000000-0000-0000-0000-000000000001', 'returns-stock@lawson.test', '{"full_name":"Returns Stock","role":"stock"}'),
  ('e0000000-0000-0000-0000-000000000002', 'returns-buyer@lawson.test', '{"role":"procurement"}'),
  ('e0000000-0000-0000-0000-000000000003', 'returns-manager@lawson.test', '{"role":"manager"}'),
  ('e0000000-0000-0000-0000-000000000004', 'returns-admin@lawson.test', '{"role":"admin"}'),
  ('e0000000-0000-0000-0000-000000000005', 'returns-supervisor@lawson.test', '{"role":"supervisor"}');

-- A return without any packaging history must still create stock on hand.
-- This deletion is transaction-local and is rolled back at the end of the suite.
delete from public.packaging_daily_records where product = 'Ginger';
do $$
declare before_bitters numeric; before_produced numeric; before_loaded numeric;
        after_bitters numeric; after_produced numeric; after_loaded numeric; ginger numeric;
begin
  select available, total_produced, total_loaded into before_bitters, before_produced, before_loaded
    from public.finished_goods_stock() where product = 'Bitters';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  insert into public.product_returns (date, shift, product, cartons) values
    ('2026-12-10', 'Morning', 'Bitters', 12),
    ('2026-12-10', 'Morning', 'Ginger', 7),
    ('2026-12-09', 'Night', 'Bitters', 3.5);
  select available, total_produced, total_loaded into after_bitters, after_produced, after_loaded
    from public.finished_goods_stock() where product = 'Bitters';
  select available into ginger from public.finished_goods_stock() where product = 'Ginger';
  assert after_bitters = before_bitters + 15.5, 'returns must add exactly once, including late entries';
  assert after_produced = before_produced and after_loaded = before_loaded,
    'returns must not rewrite production or loaded totals';
  assert ginger = 7, 'a product with no production records must still have returned stock';
  reset role;
  raise notice 'PASS stock can record returns; balance increases per product without multiplying movements';
end $$;

-- Management cannot record a physical return, even through a direct table call.
do $$
declare caller text; blocked boolean;
begin
  set local role authenticated;
  foreach caller in array array['e0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000004'] loop
    perform set_config('request.jwt.claim.sub', caller, true);
    blocked := false;
    begin
      insert into public.product_returns (date, shift, product, cartons)
        values ('2026-12-10', 'Afternoon', 'Bitters', 1);
    exception when insufficient_privilege then blocked := true;
    end;
    assert blocked, 'manager and admin must not record returns';
  end loop;
  reset role;
  raise notice 'PASS manager and admin cannot record returns';
end $$;

do $$
declare caller text; blocked boolean; n int; total numeric;
begin
  set local role authenticated;
  foreach caller in array array['e0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000005'] loop
    perform set_config('request.jwt.claim.sub', caller, true);
    blocked := false;
    begin
      insert into public.product_returns (date, shift, product, cartons)
        values ('2026-12-10', 'Morning', 'Bitters', 100);
    exception when insufficient_privilege then blocked := true;
    end;
    assert blocked, 'procurement and supervisors must not insert returns';
  end loop;
  select count(*) into n from public.product_returns;
  assert n = 0, 'supervisors must not read return records';
  select count(*) into n from public.product_return_totals('2026-12-09', '2026-12-10');
  assert n = 0, 'return aggregates must respect supervisor RLS';
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000002', true);
  select count(*) into n from public.product_returns;
  assert n = 3, 'procurement must read all return records';
  select cartons into total from public.product_return_totals('2026-12-10', '2026-12-10') where product = 'Bitters';
  assert total = 12, 'return totals must respect the date filter and sum numerically';
  reset role;
  raise notice 'PASS procurement reads only; supervisor reads/writes denied; totals respect dates and RLS';
end $$;

-- Reject invalid quantities and identity spoofing at the database boundary.
-- The final bad row in a multi-product INSERT must roll back the good row too.
do $$
declare qty numeric; blocked boolean; n int; before_count int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-000000000001', true);
  foreach qty in array array[0::numeric, -1::numeric, 'NaN'::numeric] loop
    blocked := false;
    begin
      insert into public.product_returns (date, shift, product, cartons)
        values ('2026-12-10', 'Night', 'Bitters', qty);
    exception when check_violation then blocked := true;
    end;
    assert blocked, 'zero, negative and NaN cartons must be rejected';
  end loop;
  blocked := false;
  begin
    insert into public.product_returns (date, shift, product, cartons, user_id)
      values ('2026-12-10', 'Night', 'Bitters', 1, 'e0000000-0000-0000-0000-000000000004');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'a return cannot be attributed to another account';
  select count(*) into before_count from public.product_returns;
  blocked := false;
  begin
    insert into public.product_returns (date, shift, product, cartons) values
      ('2026-12-10', 'Night', 'Bitters', 10), ('2026-12-10', 'Night', 'Ginger', -1);
  exception when check_violation then blocked := true;
  end;
  select count(*) into n from public.product_returns;
  assert blocked and n = before_count, 'multi-product returns must be atomic on rejection';
  reset role;
  raise notice 'PASS invalid quantities and spoofed identity rejected; multi-product insert is atomic';
end $$;

do $$
declare blocked boolean := false;
begin
  assert (select relrowsecurity from pg_class where oid = 'public.product_returns'::regclass),
    'product_returns requires RLS';
  assert not has_table_privilege('authenticated', 'public.product_returns', 'update'), 'returns are append-only';
  assert not has_table_privilege('authenticated', 'public.product_returns', 'delete'), 'returns are append-only';
  assert not has_table_privilege('anon', 'public.product_returns', 'select'), 'anon must not read returns';
  assert not has_table_privilege('anon', 'public.product_returns', 'insert'), 'anon must not insert returns';
  assert not has_function_privilege('anon', 'public.finished_goods_stock()', 'execute'), 'anon must not call the balance RPC';
  assert not has_function_privilege('anon', 'public.product_return_totals(date,date)', 'execute'), 'anon must not call return totals';
  begin
    set local role anon;
    perform count(*) from public.finished_goods_stock();
  exception when insufficient_privilege then blocked := true;
  end;
  reset role;
  assert blocked, 'anonymous balance access must actually fail';
  raise notice 'PASS return privileges and balance RPC lockdown';
end $$;
rollback;
select '✓ 07_product_returns.sql — return balances, atomicity and role permissions verified' as result;
