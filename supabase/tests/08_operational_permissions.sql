begin;
-- Independent fixtures: these assertions never inherit another suite's identities.
insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'ops-stock@lawson.test', '{"role":"stock"}'),
  ('f0000000-0000-0000-0000-000000000002', 'ops-manager@lawson.test', '{"role":"manager"}'),
  ('f0000000-0000-0000-0000-000000000003', 'ops-admin@lawson.test', '{"role":"admin"}'),
  ('f0000000-0000-0000-0000-000000000004', 'ops-supervisor@lawson.test', '{"role":"supervisor","department":"Packaging","group_number":"1"}');

do $$
declare caller text; stmt text; blocked boolean; n int;
begin
  set local role authenticated;
  foreach caller in array array['f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003'] loop
    perform set_config('request.jwt.claim.sub', caller, true);
    assert not public.can_write_stock(), 'manager and admin must not write stock';
    foreach stmt in array array[
      'select public.record_stock_count(''alcohol'', ''2026-12-20'', 1)',
      'select public.record_invoice(''Supplier'', ''OPS-1'', ''2026-12-20'', ''[{"material_type":"tax_stamp","quantity":1,"unit":"boxes","unit_cost":1}]''::jsonb)',
      'select public.record_dispatch(''2026-12-20'', ''Morning'', ''GT-1'', ''Driver'', ''Accra'', ''[{"product":"Bitters","cartons":1}]''::jsonb)',
      'insert into public.raw_materials_received(date,material_type) values (''2026-12-20'',''tax_stamp'')',
      'insert into public.stock_counts(date,material,counted_qty) values (''2026-12-20'',''alcohol'',1)',
      'insert into public.packaging_daily_records(date,shift,department,product,user_id) values (''2026-12-20'',''Morning'',''Packaging'',''Bitters'',auth.uid())',
      'insert into public.no_work_records(date,shift,department,reason,user_id) values (''2026-12-20'',''Morning'',''Packaging'',''No work'',auth.uid())',
      'insert into public.stock_records(date,shift,department,material,user_id) values (''2026-12-20'',''Morning'',''Filling Line'',''caps'',auth.uid())'
    ] loop
      blocked := false;
      begin execute stmt; exception when insufficient_privilege then blocked := true; end;
      assert blocked, format('manager/admin operational write unexpectedly allowed: %s', stmt);
    end loop;
  end loop;
  assert not public.can_read_stock(), 'admin must not read operational stock';
  select count(*) into n from public.packaging_daily_records;
  assert n = 0, 'admin must not read production records';
  select count(*) into n from public.dispatches;
  assert n = 0, 'admin must not read dispatch records';
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
  assert public.can_read_stock(), 'manager must read stock dashboards';
  select count(*) into n from public.packaging_daily_records;
  assert n > 0, 'manager must still read production dashboards';
  reset role;
  raise notice 'PASS manager/admin write matrix; admin operational reads denied; manager reads preserved';
end $$;

do $$
declare branch text; blocked boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  foreach branch in array array['Head Office','Accra','Bolgatanga','Cape Coast','Ho & Togo','Koforidua','Takoradi','Tarkwa','Techiman','Wa'] loop
    perform public.record_dispatch('2026-12-20', 'Morning', 'GT-1', 'Driver', branch,
      '[{"product":"Bitters","cartons":1}]'::jsonb);
  end loop;
  begin
    perform public.record_dispatch('2026-12-20', 'Morning', 'GT-1', 'Driver', 'Unknown branch',
      '[{"product":"Bitters","cartons":1}]'::jsonb);
  exception when check_violation then blocked := true;
  end;
  assert blocked, 'new dispatches must use a confirmed branch';
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', true);
  insert into public.packaging_daily_records(date,shift,department,product,user_id)
    values ('2026-12-20','Morning','Packaging','Bitters',auth.uid());
  reset role;
  raise notice 'PASS all ten branches accepted, unknown branch rejected, supervisor submission preserved';
end $$;
rollback;
