-- Test suite 09: Donations and Returns Classification (Repack vs Spoilage)
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'don-stock@lawson.test', '{"full_name":"Donations Stock","role":"stock"}'),
  ('f0000000-0000-0000-0000-000000000002', 'don-procurement@lawson.test', '{"role":"procurement"}'),
  ('f0000000-0000-0000-0000-000000000003', 'don-manager@lawson.test', '{"role":"manager"}'),
  ('f0000000-0000-0000-0000-000000000004', 'don-admin@lawson.test', '{"role":"admin"}'),
  ('f0000000-0000-0000-0000-000000000005', 'don-supervisor@lawson.test', '{"role":"supervisor"}');

-- 1. Test Donations RLS and behavior
do $$
declare blocked boolean; read_count int;
begin
  -- Stock officer can record donations
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  insert into public.donations (date, shift, product, cartons, recipient, remarks)
    values ('2026-12-10', 'Morning', 'Bitters', 10, 'Festival Sponsorship', 'Approved promo');

  -- Manager can read donations
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', true);
  select count(*) into read_count from public.donations where date = '2026-12-10';
  assert read_count = 1, 'manager must be able to read donations';

  -- Manager cannot insert donations
  blocked := false;
  begin
    insert into public.donations (date, shift, product, cartons, recipient)
      values ('2026-12-10', 'Morning', 'Ginger', 5, 'VIP Gifting');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'manager must not record donations';

  -- Supervisor cannot insert or read donations
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', true);
  select count(*) into read_count from public.donations where date = '2026-12-10';
  assert read_count = 0, 'supervisor cannot read donations';

  blocked := false;
  begin
    insert into public.donations (date, shift, product, cartons, recipient)
      values ('2026-12-10', 'Morning', 'Bitters', 2, 'Gifting');
  exception when insufficient_privilege then blocked := true;
  end;
  assert blocked, 'supervisor cannot insert donations';

  reset role;
  raise notice 'PASS donations RLS verified';
end $$;

-- 2. Test returns repack_cartons and spoilage_cartons
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
  insert into public.product_returns (date, shift, product, cartons, repack_cartons, spoilage_cartons, driver_name, vehicle_reg)
    values ('2026-12-10', 'Afternoon', 'Bitters', 50, 45, 5, 'Kankam', 'GT 1234-20');

  reset role;
  raise notice 'PASS returns repack and spoilage recorded';
end $$;

rollback;
