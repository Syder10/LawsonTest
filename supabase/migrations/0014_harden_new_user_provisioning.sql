-- ============================================================================
-- 0014_harden_new_user_provisioning.sql
--
-- Makes handle_new_user() tolerant of whatever is (or isn't) in the auth user's
-- metadata, so creating a user from the Supabase dashboard can never fail with
-- an opaque "Database error saving new user".
--
-- WHY
-- ---
-- The 0003 version interpolated three metadata values straight into the insert:
--
--     coalesce((raw_user_meta_data ->> 'role')::public.user_role, 'supervisor')
--     nullif(raw_user_meta_data ->> 'department', '')
--     nullif(raw_user_meta_data ->> 'group_number', '')::smallint
--
-- Each is a way for the whole INSERT on auth.users to abort, because this is an
-- AFTER INSERT trigger and its exception propagates to the caller:
--   • role 'Admin' / 'administrator' / typo  -> invalid enum input (22P02)
--   • department 'packaging' / 'Blowing Dept' -> FK violation against
--                                               departments(name) (23503)
--   • group_number '7' or 'abc'              -> CHECK violation / 22P02
--
-- Now each value is parsed defensively and falls back to the safe default
-- instead of rejecting the account. An operator creating a user by hand gets a
-- working supervisor profile they can then correct, rather than a failed signup.
--
-- IMPORTANT — profiles.role is the ONLY source of truth for authorization.
-- This trigger runs ONCE, on INSERT. Editing the auth user's metadata afterwards
-- does NOT change profiles.role: nothing re-reads it. Change the role either
-- through the app's User Management screen (/dashboard/admin/users, which uses
-- the service role) or with SQL against public.profiles. See
-- supabase/diagnose-roles.sql for a query that shows the two side by side.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta  jsonb    := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role  public.user_role := 'supervisor';
  v_dept  text     := nullif(v_meta ->> 'department', '');
  v_group smallint := null;
  v_raw   text;
begin
  -- role: unknown or mis-cased values fall back to supervisor.
  v_raw := nullif(v_meta ->> 'role', '');
  if v_raw is not null then
    begin
      v_role := v_raw::public.user_role;
    exception when invalid_text_representation then
      v_role := 'supervisor';
    end;
  end if;

  -- department: must match departments(name) exactly or the FK would abort.
  if v_dept is not null and not exists (
    select 1 from public.departments d where d.name = v_dept
  ) then
    v_dept := null;
  end if;

  -- group_number: must be 1..3 to satisfy the CHECK constraint.
  v_raw := nullif(v_meta ->> 'group_number', '');
  if v_raw is not null then
    begin
      v_group := v_raw::smallint;
      if v_group < 1 or v_group > 3 then
        v_group := null;
      end if;
    exception when invalid_text_representation or numeric_value_out_of_range then
      v_group := null;
    end;
  end if;

  insert into public.profiles (id, email, full_name, role, department, group_number)
  values (
    new.id,
    new.email,
    nullif(v_meta ->> 'full_name', ''),
    v_role,
    v_dept,
    v_group
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
