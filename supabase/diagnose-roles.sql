-- ============================================================================
-- diagnose-roles.sql
-- Paste into the Supabase SQL editor (Dashboard -> SQL Editor) and run.
--
-- Answers "why does this account behave like a supervisor when I set it to
-- admin?" by showing, per account, the role the APP actually uses
-- (public.profiles.role) next to the role stored in the auth user's metadata.
--
-- Only public.profiles.role controls access. auth metadata is read exactly once,
-- by the on_auth_user_created trigger, when the account is first created.
-- Editing it later changes NOTHING — that is the usual cause of this symptom.
-- ============================================================================

-- 1) The comparison. Look at the `verdict` column.
select
  u.email,
  p.role                            as app_role,        -- the one that counts
  u.raw_user_meta_data ->> 'role'   as auth_metadata_role,
  p.department,
  p.group_number,
  case
    when p.id is null
      then 'NO PROFILE ROW — the account cannot sign in at all'
    when (u.raw_user_meta_data ->> 'role') is null
      then 'metadata has no role; app_role is what applies'
    when p.role::text = (u.raw_user_meta_data ->> 'role')
      then 'consistent'
    else 'MISMATCH — the app uses app_role (' || p.role || '), not the metadata value'
  end                               as verdict,
  u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at desc;

-- 2) Is the auto-provision trigger installed at all?
--    Expect exactly one row: on_auth_user_created.
select tgname, tgrelid::regclass as on_table, tgenabled
from pg_trigger
where not tgisinternal and tgname = 'on_auth_user_created';

-- 3) Is the privilege guard from 0012 installed?
--    Expect exactly one row: profiles_guard_privileged_columns.
select tgname, tgrelid::regclass as on_table, tgenabled
from pg_trigger
where not tgisinternal and tgname = 'profiles_guard_privileged_columns';

-- 4) Accounts with no profile row (these fail login with
--    "No valid profile is configured for this account.").
select u.id, u.email, u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ── FIXES ───────────────────────────────────────────────────────────────────
-- Prefer the app's User Management screen (/dashboard/admin/users). It uses the
-- service role, so it is allowed through the 0012 guard. If you must do it in
-- SQL, run it HERE in the SQL editor (the editor connects as the table owner,
-- which the guard also permits):
--
--   update public.profiles set role = 'admin'   where email = 'someone@llc.com';
--   update public.profiles set role = 'manager' where email = 'someone@llc.com';
--
-- Assigning a supervisor their department + rotation group (both are required
-- before compulsory records and scoring work):
--
--   update public.profiles
--      set department = 'Packaging',   -- must match departments.name EXACTLY
--          group_number = 2            -- 1..3
--    where email = 'someone@llc.com';
--
--   select name from public.departments order by name;   -- valid department names
--
-- Backfill a missing profile row:
--
--   insert into public.profiles (id, email, full_name, role)
--   select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', u.email), 'supervisor'
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--   where p.id is null
--   on conflict (id) do nothing;
--
-- After ANY role change the user must sign out and sign in again — the dashboard
-- reads the role server-side per request, but an open page keeps its rendering
-- until it reloads.
