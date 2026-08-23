-- ============================================================================
-- 0003_profiles.sql
-- User profiles (1:1 with auth.users) + auto-provisioning trigger + RLS.
--
-- Changes vs old schema:
--   • role is now an enum (was CHECK-on-text)
--   • department is a FK to departments(name) (was free text)
--   • group_number CHECK aligned to 1..3
--   • a handle_new_user() trigger creates the profile row automatically on
--     signup, pulling full_name / role / department / group_number from the
--     auth user's metadata. The old schema had NO such trigger, so profiles
--     only existed when the admin API inserted them by hand.
--   • dropped supervisor_id (it was being set to the email local-part string,
--     which was meaningless — see review notes). Re-add later if a real
--     external supervisor identifier is needed.
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
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, department, group_number)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'supervisor'),
    nullif(new.raw_user_meta_data ->> 'department', ''),
    nullif(new.raw_user_meta_data ->> 'group_number', '')::smallint
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

-- Update own profile. NOTE: role/department escalation is prevented at the
-- application layer (the profile-update API never accepts `role`, and admins
-- change roles through the service-role admin API). A DB-level guard against
-- self-role-change can be added with a column-level trigger if desired.
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins may update any profile (role assignment, department, etc.).
create policy "profiles_update_admin"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
