-- ============================================================================
-- supabase/tests/02_security.sql
--
-- Behaviour tests for the two DB-enforced boundaries:
--   • 0003_identity.sql — a supervisor cannot change their own
--     role / department / group_number, but an admin (and the service role) can.
--   • 0004_records.sql — one record per (type, date,
--     shift, product/variant), with the deliberate exemptions preserved.
--
-- These run as the TABLE OWNER, so RLS is bypassed. That is the whole point: it
-- proves the protection comes from a TRIGGER and a UNIQUE INDEX, not from a
-- policy or from the API layer. A supervisor calling PostgREST directly with
-- their own JWT and the public anon key takes exactly this path.
-- ============================================================================

-- ── Fixtures ────────────────────────────────────────────────────────────────
-- Inserting into auth.users fires handle_new_user() (0003), which provisions the
-- matching profiles row from the user metadata.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'kofi@lawson.test',
   '{"full_name":"Kofi Supervisor","role":"supervisor","department":"Blowing","group_number":"1"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'ada@lawson.test',
   '{"full_name":"Ada Admin","role":"admin"}'::jsonb);

do $$
declare n int; r public.user_role;
begin
  select count(*) into n from public.profiles
   where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222');
  assert n = 2, format('handle_new_user should have provisioned 2 profiles, got %s', n);
  select role into r from public.profiles where id = '22222222-2222-2222-2222-222222222222';
  assert r = 'admin', format('admin fixture role expected admin, got %s', r);
  raise notice 'PASS fixtures provisioned via handle_new_user';
end $$;

-- ════════════════════════ profile privilege guard (0003) ════════════════════════

-- Act as the SUPERVISOR from here on.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

-- The exact attack the guard exists to stop:
--   supabase.from('profiles').update({ role: 'admin' }).eq('id', me)
do $$
declare blocked boolean := false; r public.user_role;
begin
  begin
    update public.profiles set role = 'admin'
      where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked, 'SECURITY: supervisor was able to set their own role — escalation hole is OPEN';
  select role into r from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  assert r = 'supervisor', format('role must be unchanged, got %s', r);
  raise notice 'PASS supervisor cannot self-promote to admin';
end $$;

-- Department decides which records they may submit AND their compulsory set:
-- switching to Concentrate (no compulsory records) would be a free pass forever.
do $$
declare blocked boolean := false; d text;
begin
  begin
    update public.profiles set department = 'Concentrate'
      where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked, 'SECURITY: supervisor changed their own department';
  select department into d from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  assert d = 'Blowing', format('department must be unchanged, got %s', d);
  raise notice 'PASS supervisor cannot change their own department';
end $$;

-- Group decides which shift counts as on-time for them.
do $$
declare blocked boolean := false;
begin
  begin
    update public.profiles set group_number = 3
      where id = '11111111-1111-1111-1111-111111111111';
  exception when insufficient_privilege then
    blocked := true;
  end;
  assert blocked, 'SECURITY: supervisor changed their own rotation group';
  raise notice 'PASS supervisor cannot change their own rotation group';
end $$;

-- …but the guard must NOT block ordinary self-service edits.
update public.profiles set full_name = 'Kofi A. Supervisor'
  where id = '11111111-1111-1111-1111-111111111111';
do $$
declare n text;
begin
  select full_name into n from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  assert n = 'Kofi A. Supervisor', format('full_name should be self-editable, got %s', n);
  raise notice 'PASS supervisor can still edit their own full_name';
end $$;

-- An ADMIN acting through their own JWT may reassign all three.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
update public.profiles
   set role = 'manager', department = 'Packaging', group_number = 2
 where id = '11111111-1111-1111-1111-111111111111';
do $$
declare r public.user_role; d text; g smallint;
begin
  select role, department, group_number into r, d, g
    from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  assert r = 'manager'  , format('admin should set role, got %s', r);
  assert d = 'Packaging', format('admin should set department, got %s', d);
  assert g = 2          , format('admin should set group, got %s', g);
  raise notice 'PASS admin can reassign role/department/group';
end $$;

-- The service role / table owner (no JWT context) may too — this is the path
-- /api/admin/users takes, and it must keep working.
set request.jwt.claim.sub = '';
update public.profiles
   set role = 'supervisor', department = 'Blowing', group_number = 1
 where id = '11111111-1111-1111-1111-111111111111';
do $$
declare r public.user_role;
begin
  select role into r from public.profiles where id = '11111111-1111-1111-1111-111111111111';
  assert r = 'supervisor', format('service-role path should set role, got %s', r);
  raise notice 'PASS service-role/owner path can reassign privileged columns';
end $$;

-- ════════════════════ one record per shift (0004) ════════════════════════

-- ── stock_records: keyed by (material, date, shift, product, variant) ────────
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-09-01','Morning','Filling Line','caps',10,5);

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
    values ('2026-09-01','Morning','Filling Line','caps',99,99);
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'duplicate caps record for the same date+shift was accepted — ledger would double-count';
  raise notice 'PASS duplicate stock_records blocked';
end $$;

-- A different SHIFT on the same date is a different record — must be allowed.
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-09-01','Afternoon','Filling Line','caps',0,7);

-- labels track product: Bitters and Ginger are separate ledgers.
insert into public.stock_records (date, shift, department, material, product, quantity_received, quantity_used)
values ('2026-09-01','Morning','Filling Line','labels','Bitters',100,20);
insert into public.stock_records (date, shift, department, material, product, quantity_received, quantity_used)
values ('2026-09-01','Morning','Filling Line','labels','Ginger',100,30);

do $$
declare blocked boolean := false; n int;
begin
  begin
    insert into public.stock_records (date, shift, department, material, product, quantity_received, quantity_used)
    values ('2026-09-01','Morning','Filling Line','labels','Bitters',1,1);
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'duplicate labels/Bitters record was accepted';
  select count(*) into n from public.stock_records
   where material='labels' and date='2026-09-01' and shift='Morning';
  assert n = 2, format('both label products should coexist, got %s rows', n);
  raise notice 'PASS per-product stock records coexist, duplicates blocked';
end $$;

-- herbs are keyed by variant.
insert into public.herb_types (name) values ('Alligator Pepper'), ('Prekese');
insert into public.stock_records (date, shift, department, material, variant, quantity_received, quantity_used)
values ('2026-09-01','Morning','Concentrate','herb','Alligator Pepper',5,2);
insert into public.stock_records (date, shift, department, material, variant, quantity_received, quantity_used)
values ('2026-09-01','Morning','Concentrate','herb','Prekese',8,3);

do $$
declare blocked boolean := false;
begin
  begin
    insert into public.stock_records (date, shift, department, material, variant, quantity_received, quantity_used)
    values ('2026-09-01','Morning','Concentrate','herb','Prekese',1,1);
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'duplicate herb/Prekese record was accepted';
  raise notice 'PASS per-variant herb records coexist, duplicates blocked';
end $$;

-- ── Packaging: keyed per product ────────────────────────────────────────────
insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
values ('2026-09-06','Morning','Packaging','Bitters',40);
insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
values ('2026-09-06','Morning','Packaging','Ginger',20);
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
    values ('2026-09-06','Morning','Packaging','Bitters',1);
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'duplicate packaging Bitters record was accepted — stamp/carton consumption would double';
  raise notice 'PASS duplicate packaging blocked, per-product allowed';
end $$;

-- ── Shared record type across two departments must still work ───────────────
-- "Daily Records Alcohol For Concentrate" belongs to BOTH Concentrate and
-- Alcohol and Blending, so each files its own row for the same date+shift.
insert into public.concentrate_alcohol_records (date, shift, department, number_tanks_70)
values ('2026-09-05','Morning','Concentrate',2);
insert into public.concentrate_alcohol_records (date, shift, department, number_tanks_70)
values ('2026-09-05','Morning','Alcohol and Blending',3);
do $$
declare blocked boolean := false; n int;
begin
  begin
    insert into public.concentrate_alcohol_records (date, shift, department, number_tanks_70)
    values ('2026-09-05','Morning','Concentrate',9);
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'duplicate concentrate record for the same department was accepted';
  select count(*) into n from public.concentrate_alcohol_records where date='2026-09-05';
  assert n = 2, format('both departments should coexist, got %s rows', n);
  raise notice 'PASS shared record type is per-department, duplicates blocked';
end $$;

-- ── Extraction monitoring is DELIBERATELY exempt (one row per tank) ──────────
insert into public.extraction_monitoring_records (date, shift, department, product, tank_number)
values ('2026-09-08','Morning','Alcohol and Blending','Bitters','T1');
insert into public.extraction_monitoring_records (date, shift, department, product, tank_number)
values ('2026-09-08','Morning','Alcohol and Blending','Bitters','T2');
insert into public.extraction_monitoring_records (date, shift, department, product, tank_number)
values ('2026-09-08','Morning','Alcohol and Blending','Bitters','T3');
do $$
declare n int;
begin
  select count(*) into n from public.extraction_monitoring_records where date='2026-09-08';
  assert n = 3, format('extraction must allow one row per tank, got %s', n);
  raise notice 'PASS extraction monitoring still accepts multiple tanks per shift';
end $$;

-- ── No-work records ─────────────────────────────────────────────────────────
insert into public.no_work_records (date, shift, department, reason)
values ('2026-09-07','Morning','Blowing','Power Outage');
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.no_work_records (date, shift, department, reason)
    values ('2026-09-07','Morning','Blowing','Machine Breakdown');
  exception when unique_violation then
    blocked := true;
  end;
  assert blocked, 'duplicate no-work record was accepted';
  raise notice 'PASS duplicate no-work blocked';
end $$;

-- ════════════════ resilient new-user provisioning (0003) ════════════════
-- Bad metadata must never abort account creation. Before this hardening, each of these
-- raised out of the AFTER INSERT trigger and surfaced in the Supabase dashboard
-- as "Database error saving new user".
set request.jwt.claim.sub = '';

insert into auth.users (id, email, raw_user_meta_data) values
  -- invalid enum value for role
  ('33333333-3333-3333-3333-333333333333', 'badrole@lawson.test',
   '{"full_name":"Bad Role","role":"Administrator"}'::jsonb),
  -- department that is not in departments(name) (FK violation)
  ('44444444-4444-4444-4444-444444444444', 'baddept@lawson.test',
   '{"full_name":"Bad Dept","role":"supervisor","department":"packaging dept"}'::jsonb),
  -- group_number outside the 1..3 CHECK, and non-numeric
  ('55555555-5555-5555-5555-555555555555', 'badgroup@lawson.test',
   '{"full_name":"Bad Group","role":"supervisor","department":"Blowing","group_number":"7"}'::jsonb),
  ('66666666-6666-6666-6666-666666666666', 'nangroup@lawson.test',
   '{"full_name":"NaN Group","role":"manager","group_number":"abc"}'::jsonb),
  -- no metadata at all
  ('77777777-7777-7777-7777-777777777777', 'nometa@lawson.test', null);

do $$
declare r public.user_role; d text; g smallint; n int;
begin
  select count(*) into n from public.profiles where id in (
    '33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555','66666666-6666-6666-6666-666666666666',
    '77777777-7777-7777-7777-777777777777');
  assert n = 5, format('all 5 accounts should get a profile, got %s', n);

  -- Invalid role degrades to supervisor rather than aborting.
  select role into r from public.profiles where id = '33333333-3333-3333-3333-333333333333';
  assert r = 'supervisor', format('invalid role should fall back to supervisor, got %s', r);

  -- Unknown department is dropped, not FK-violated.
  select department into d from public.profiles where id = '44444444-4444-4444-4444-444444444444';
  assert d is null, format('unknown department should be null, got %s', d);

  -- Out-of-range group is dropped but a VALID department is kept.
  select department, group_number into d, g from public.profiles
   where id = '55555555-5555-5555-5555-555555555555';
  assert g is null, format('out-of-range group should be null, got %s', g);
  assert d = 'Blowing', format('valid department should survive, got %s', d);

  -- Non-numeric group is dropped but a VALID role is kept.
  select role, group_number into r, g from public.profiles
   where id = '66666666-6666-6666-6666-666666666666';
  assert g is null, format('non-numeric group should be null, got %s', g);
  assert r = 'manager', format('valid role should survive, got %s', r);

  -- Null metadata still provisions a default supervisor.
  select role into r from public.profiles where id = '77777777-7777-7777-7777-777777777777';
  assert r = 'supervisor', format('null metadata should default to supervisor, got %s', r);

  raise notice 'PASS new-user provisioning survives invalid role/department/group metadata';
end $$;

-- A VALID role in metadata must still be honoured — the fallback must not
-- flatten every account to supervisor.
insert into auth.users (id, email, raw_user_meta_data) values
  ('88888888-8888-8888-8888-888888888888', 'goodadmin@lawson.test',
   '{"full_name":"Good Admin","role":"admin","department":"Packaging","group_number":"2"}'::jsonb);
do $$
declare r public.user_role; d text; g smallint;
begin
  select role, department, group_number into r, d, g
    from public.profiles where id = '88888888-8888-8888-8888-888888888888';
  assert r = 'admin'    , format('valid admin role must be honoured, got %s', r);
  assert d = 'Packaging', format('valid department must be honoured, got %s', d);
  assert g = 2          , format('valid group must be honoured, got %s', g);
  raise notice 'PASS valid metadata is still honoured (role/department/group)';
end $$;

select '✓ 02_security.sql — profile guard + duplicate guard tests passed' as result;
