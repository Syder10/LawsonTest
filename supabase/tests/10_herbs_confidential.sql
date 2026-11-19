-- ============================================================================
-- 10_herbs_confidential.sql — herb stock is confidential to the Production Manager
-- (0015). Proves, against real RLS and the real ledger functions, who can and
-- cannot see herb stock. Rolled back, so no other suite's figures move.
-- ============================================================================
begin;

insert into auth.users (id, email, raw_user_meta_data) values
  ('f1000000-0000-0000-0000-000000000001', 'herb-manager@lawson.test',  '{"full_name":"Herb Manager","role":"manager"}'),
  ('f1000000-0000-0000-0000-000000000002', 'herb-stock@lawson.test',    '{"full_name":"Herb Stock","role":"stock"}'),
  ('f1000000-0000-0000-0000-000000000003', 'herb-buyer@lawson.test',    '{"full_name":"Herb Buyer","role":"procurement"}'),
  ('f1000000-0000-0000-0000-000000000004', 'herb-conc-1@lawson.test',   '{"full_name":"Conc One","role":"supervisor","department":"Concentrate","group_number":"1"}'),
  ('f1000000-0000-0000-0000-000000000005', 'herb-conc-2@lawson.test',   '{"full_name":"Conc Two","role":"supervisor","department":"Concentrate","group_number":"2"}'),
  ('f1000000-0000-0000-0000-000000000006', 'herb-blowing@lawson.test',  '{"full_name":"Blow Sup","role":"supervisor","department":"Blowing","group_number":"1"}'),
  ('f1000000-0000-0000-0000-000000000007', 'herb-admin@lawson.test',    '{"full_name":"Herb Admin","role":"admin"}');

insert into public.herb_types (name) values ('Test Root') on conflict do nothing;

-- Herb movements filed by Concentrate supervisor 1 (as themselves, through RLS),
-- plus one non-herb movement so we can prove the stock office still sees the rest.
do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000004', true);
  insert into public.stock_records (date, shift, department, material, variant, quantity_received, quantity_used, user_id)
  values ('2027-03-01', 'Morning', 'Concentrate', 'herb', 'Test Root', 10, 3, 'f1000000-0000-0000-0000-000000000004');
  reset role;
end $$;
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used, user_id)
values ('2027-03-01', 'Morning', 'Alcohol and Blending', 'alcohol', 5, 1, null);
insert into public.stock_counts (date, shift, material, variant, counted_qty, computed_qty, kind)
values ('2027-03-02', 'Morning', 'herb', 'Test Root', 6, 7, 'reconciliation');

-- Helpers, local to this suite: what a given user can see.
create function pg_temp.herb_rows(uid text) returns int language plpgsql as $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', uid, true);
  select count(*) into n from public.stock_records where material = 'herb' and variant = 'Test Root';
  reset role;
  return n;
end $$;

create function pg_temp.herb_balance_refused(uid text) returns boolean language plpgsql as $$
declare v numeric;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', uid, true);
  begin
    v := public.stock_remaining_asof('herb', '2027-03-01', null, 'Test Root');
  exception when insufficient_privilege then
    reset role;
    return true;
  end;
  reset role;
  return false;
end $$;

do $$
begin
  assert pg_temp.herb_rows('f1000000-0000-0000-0000-000000000001') = 1, 'manager must see herb records';
  assert pg_temp.herb_rows('f1000000-0000-0000-0000-000000000002') = 0, 'stock must NOT see herb records';
  assert pg_temp.herb_rows('f1000000-0000-0000-0000-000000000003') = 0, 'procurement must NOT see herb records';
  assert pg_temp.herb_rows('f1000000-0000-0000-0000-000000000004') = 1, 'the recording supervisor sees their own entry';
  assert pg_temp.herb_rows('f1000000-0000-0000-0000-000000000005') = 0, 'another supervisor does not see it (own entries only)';
  assert pg_temp.herb_rows('f1000000-0000-0000-0000-000000000007') = 0, 'admin does not see herb stock';
  raise notice 'PASS herb records: manager all, recording supervisor own, stock/procurement/admin none';
end $$;

do $$
declare n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
  select count(*) into n from public.stock_records where material = 'alcohol' and date = '2027-03-01';
  reset role;
  assert n = 1, 'the stock office must still see non-herb records';
  raise notice 'PASS the stock office keeps every non-herb record';
end $$;

do $$
begin
  assert pg_temp.herb_balance_refused('f1000000-0000-0000-0000-000000000002'), 'stock must be refused a herb balance';
  assert pg_temp.herb_balance_refused('f1000000-0000-0000-0000-000000000003'), 'procurement must be refused a herb balance';
  assert pg_temp.herb_balance_refused('f1000000-0000-0000-0000-000000000006'), 'a non-Concentrate supervisor must be refused';
  assert pg_temp.herb_balance_refused('f1000000-0000-0000-0000-000000000007'), 'admin must be refused a herb balance';
  assert not pg_temp.herb_balance_refused('f1000000-0000-0000-0000-000000000001'), 'manager must get herb balances';
  assert not pg_temp.herb_balance_refused('f1000000-0000-0000-0000-000000000005'),
    'a Concentrate supervisor needs the herb opening to file the Herbs Stock form';
  raise notice 'PASS herb balances: refused outside manager + Concentrate supervisors (the definer functions are gated)';
end $$;

do $$
declare v numeric; refused boolean := false; n int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
  -- Non-herb balances are untouched for the stock office.
  v := public.stock_remaining_asof('alcohol', '2027-03-01');
  assert v is not null, 'stock must still get non-herb balances';
  -- The ledger function reads stock_records past RLS, so it is gated too.
  begin
    perform * from public.stock_ledger('herb', '2027-03-01', '2027-03-31', null, 'Test Root');
  exception when insufficient_privilege then refused := true;
  end;
  assert refused, 'stock must be refused the herb ledger';
  -- A herb count would re-anchor (and reveal) the herb balance.
  refused := false;
  begin
    perform public.record_stock_count('herb', '2027-03-03', 5, 'Morning', null, 'Test Root');
  exception when insufficient_privilege then refused := true;
  end;
  assert refused, 'stock must not record a herb count';
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
  select count(*) into n from public.stock_ledger('herb', '2027-03-01', '2027-03-31', null, 'Test Root');
  reset role;
  assert n = 1, format('manager must get the herb ledger, got %s rows', n);
  raise notice 'PASS stock_ledger and record_stock_count refuse herbs outside the herb readers; non-herb untouched';
end $$;

do $$
declare stock_counts_seen int; manager_counts_seen int;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
  select count(*) into stock_counts_seen from public.stock_counts where material = 'herb';
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000001', true);
  select count(*) into manager_counts_seen from public.stock_counts where material = 'herb';
  reset role;
  assert stock_counts_seen = 0, 'stock must not see herb counts';
  assert manager_counts_seen >= 1, 'manager must see herb counts';
  raise notice 'PASS herb counts follow herb stock';
end $$;

do $$
declare by_stock int; by_admin int; by_conc int; inserted boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000002', true);
  select count(*) into by_stock from public.herb_types;
  begin
    insert into public.herb_types (name) values ('Sneaky Herb');
    inserted := true;
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000007', true);
  select count(*) into by_admin from public.herb_types;
  perform set_config('request.jwt.claim.sub', 'f1000000-0000-0000-0000-000000000004', true);
  select count(*) into by_conc from public.herb_types;
  reset role;
  assert by_stock = 0, 'stock must not read herb names';
  assert not inserted, 'stock must not add herb names';
  assert by_admin >= 1, 'admin maintains the herb list, so reads names';
  assert by_conc >= 1, 'the Concentrate supervisor needs herb names for the form';
  raise notice 'PASS herb names: herb readers and admin only';
end $$;

do $$
begin
  assert not has_function_privilege('anon', 'public.can_read_herbs()', 'execute'), 'anon must not execute can_read_herbs';
  assert not has_function_privilege('anon', 'public.herb_ledger_allowed(text)', 'execute'), 'anon must not execute herb_ledger_allowed';
  assert has_function_privilege('authenticated', 'public.stock_ledger(text, date, date, public.product_type, text)', 'execute'),
    'authenticated keeps the ledger function';
  raise notice 'PASS herb helpers are revoked from anon';
end $$;

rollback;

select '✓ 10_herbs_confidential.sql — herb stock is confidential to the Production Manager' as result;
