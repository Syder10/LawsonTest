-- ============================================================================
-- 0003_identity.sql
-- User profiles (1:1 with auth.users), auto-provisioning, RLS, and the guard
-- that stops a supervisor escalating their own privileges.
--
-- Changes vs the original schema:
--   • role is an enum (was CHECK-on-text)
--   • department is a FK to departments(name) (was free text)
--   • group_number CHECK aligned to 1..3
--   • handle_new_user() creates the profile row automatically on signup. The old
--     schema had NO such trigger, so profiles only existed when the admin API
--     inserted them by hand.
--   • dropped supervisor_id (it was being set to the email local-part string,
--     which was meaningless). Re-add later if a real external identifier is needed.
--
-- profiles.role is the ONLY source of truth for authorization. Everything reads
-- it: app/dashboard/page.tsx, lib/auth/guards.ts, app/login/actions.ts.
-- ============================================================================

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text unique,
  full_name    text,
  role         public.user_role not null default 'supervisor',
  department   text references public.departments(name) on update cascade on delete set null,
  group_number smallint check (group_number between 1 and 3),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_role_idx       on public.profiles (role);
create index profiles_department_idx on public.profiles (department);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── Auto-provision a profile whenever an auth user is created ────────────────
-- Reads optional metadata set by the admin "create user" flow. Idempotent:
-- ON CONFLICT DO NOTHING so an explicit upsert from the app never collides.
--
-- Every metadata value is parsed DEFENSIVELY. This is an AFTER INSERT trigger,
-- so its exception would propagate and abort creation of the auth user itself —
-- which surfaced in the Supabase dashboard as an opaque "Database error saving
-- new user". Each of these was a way to trigger that:
--   • role 'Admin' / 'administrator' / a typo  -> invalid enum input (22P02)
--   • department 'packaging' / 'Blowing Dept'  -> FK violation (23503)
--   • group_number '7' or 'abc'                -> CHECK violation / 22P02
-- Now each falls back to the safe default instead of rejecting the account, so
-- an operator gets a working supervisor profile they can then correct.
--
-- IMPORTANT: this runs ONCE, on INSERT. Editing the auth user's metadata later
-- does NOT change profiles.role — nothing re-reads it. Change roles through the
-- app's User Management screen or with SQL against public.profiles. See
-- supabase/diagnose-roles.sql.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

-- Read: own profile, or any profile if you are manager/admin.
create policy "profiles_select"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_staff());

-- Update own profile.
--
-- IMPORTANT: RLS gates ROWS, never COLUMNS — this policy alone would let a
-- supervisor set their own role to 'admin'. Column-level protection for
-- role / department / group_number comes from the trigger below. Do not rely on
-- the API layer for it.
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins may update any profile (role assignment, department, etc.).
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── Privilege guard: closes a real escalation hole ───────────────────────────
-- Because RLS cannot restrict columns, any supervisor holding their own JWT and
-- the public anon key could bypass the app entirely and run:
--
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', me)
--
-- …and it passed. The API never accepted `role`, but the API is not the
-- boundary — the database is.
--
-- Also guarded: department and group_number. Those are not cosmetic — they
-- determine the supervisor's rostered shift, which record types they may submit,
-- and how they are scored. Self-assigning to a department with no compulsory
-- records (Concentrate) is a permanent free pass on streaks/leaderboard, and
-- switching group silently changes which shift counts as "on-time".
--
-- Postgres has no per-column RLS, so this is a BEFORE UPDATE trigger. Unlike a
-- policy, it fires for every writer including PostgREST.
--
-- Who may still change these columns:
--   • The service-role key (/api/admin/users) — bypasses RLS, carries no
--     end-user identity, so auth.uid() is NULL.
--   • A direct/owner connection (migrations, manual correction) — also NULL.
--   • An admin acting through their own JWT — is_admin().
--
-- Treating "auth.uid() IS NULL" as privileged is safe: every profiles policy is
-- granted `to authenticated` AND requires `id = auth.uid()`, which is never true
-- when auth.uid() is NULL. So a NULL uid at UPDATE time means the writer already
-- bypassed RLS — i.e. it is the service role or the table owner.
create or replace function public.is_privileged_profile_writer()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- No end-user identity => service-role key or a direct owner connection.
  -- (Unreachable for anon/authenticated callers; see header note.)
  if auth.uid() is null then
    return true;
  end if;
  -- An admin using their own session may reassign roles/departments.
  return public.is_admin();
end;
$$;

comment on function public.is_privileged_profile_writer() is
  'True when the current writer may change privileged profile columns '
  '(role, department, group_number): the service role, the table owner, or an admin.';

-- Rejects rather than silently reverting: a supervisor attempting escalation
-- gets an explicit 42501 (insufficient_privilege), which surfaces as a clear
-- error instead of a confusing no-op that looks like it worked.
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_privileged_profile_writer() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'You may not change your own role. Roles are assigned by an administrator.'
      using errcode = '42501';
  end if;

  if new.department is distinct from old.department then
    raise exception 'You may not change your own department. Departments are assigned by an administrator.'
      using errcode = '42501';
  end if;

  if new.group_number is distinct from old.group_number then
    raise exception 'You may not change your own rotation group. Groups are assigned by an administrator.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Fires before profiles_set_updated_at (trigger order is alphabetical by name),
-- so a rejected update never bumps updated_at.
drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();
