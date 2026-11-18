-- ============================================================================
-- bootstrap-admin.sql
--
-- Run this ONCE in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)
-- to get the first administrator into the system.
--
-- Solves the chicken-and-egg problem: User Management (/dashboard/admin/users)
-- requires an admin, but nothing in the app can create the first one. After this
-- script you never need SQL again — create every other account in the app.
--
-- Also fixes "This login exists but has no profile record yet." That happens
-- when auth users exist without a matching public.profiles row — most commonly
-- because the migrations were re-run (which rebuilds the `public` schema) while
-- `auth.users` survived, since Supabase keeps auth in its own schema.
--
-- Safe to re-run: every statement is idempotent.
--
--   >>> EDIT THE EMAIL ON LINE 34 BEFORE RUNNING <<<
-- ============================================================================

-- ── Step 1: give every auth user a profile row ───────────────────────────────
-- Defaults to 'supervisor'; step 2 promotes the one account you name.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
  'supervisor'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

-- ── Step 2: promote your account to admin ────────────────────────────────────
-- Change the email to YOUR login. If you sign in with just "kwame", the email is
-- 'kwame@llc.com' (the app appends @llc.com to a bare username).
update public.profiles
   set role = 'admin'
 where email = 'CHANGE_ME@llc.com';

-- ── Step 3: confirm it worked ────────────────────────────────────────────────
-- Expect at least one row with role = 'admin'. If the admin row is missing, the
-- email on line 34 did not match any account — check the list this returns.
select email, role, department, group_number, created_at
from public.profiles
order by
  case role when 'admin' then 0 when 'manager' then 1 when 'procurement' then 2 else 3 end,
  email;

-- ── Optional: assign a supervisor's department + rotation group ───────────────
-- Both are required before compulsory records, streaks and the roster work. The
-- app no longer lets supervisors set these themselves (see
-- 0003_identity.sql) — an admin assigns them in User Management,
-- or here.
--
--   select name from public.departments order by display_order;  -- valid names
--
--   update public.profiles
--      set department = 'Packaging',   -- must match departments.name EXACTLY
--          group_number = 2            -- 1..3
--    where email = 'someone@llc.com';

-- ── Why the UPDATE above is allowed ──────────────────────────────────────────
-- 0003_identity.sql installs a trigger that blocks changes to role / department /
-- group_number. The SQL editor connects as the table owner, so auth.uid() is
-- NULL and the trigger treats it as a privileged writer. The same applies to the
-- service-role key used by /api/admin/users. What it blocks is a supervisor
-- calling PostgREST with their own JWT to promote themselves.
--
-- After changing a role, that user must sign out and sign in again.
