-- ============================================================================
-- 0012_profile_privilege_guard.sql
--
-- CLOSES A PRIVILEGE-ESCALATION HOLE.
--
-- The problem
-- -----------
-- The `profiles_update_own` policy (0003) is `using (id = auth.uid()) with
-- check (id = auth.uid())`. RLS policies gate WHICH ROWS you may update, never
-- WHICH COLUMNS. So any supervisor holding their own JWT + the public anon key
-- could bypass the app entirely and run:
--
--     supabase.from('profiles').update({ role: 'admin' }).eq('id', me)
--
-- …and it passed. /api/profile/update deliberately never accepted `role`, but
-- the API is not the boundary — the database is. 0003's comment acknowledged
-- this was "left to the application layer"; this migration fixes it properly.
--
-- Also guarded: `department` and `group_number`. Those are not cosmetic — they
-- determine the supervisor's rostered shift, which record types they may submit,
-- and how they are scored. Self-assigning to a department with no compulsory
-- records (Concentrate) is a permanent free pass on streaks/leaderboard, and
-- switching group silently changes which shift counts as "on-time". They are
-- admin-assigned now (see app/dashboard/profile/profile-form.tsx).
--
-- Why a trigger and not a column-restricted policy
-- ------------------------------------------------
-- Postgres has no per-column RLS. The options are a trigger or splitting the
-- table; a BEFORE UPDATE trigger is far less invasive and, unlike a policy,
-- fires for every writer including PostgREST.
--
-- Who is still allowed to change these columns
-- --------------------------------------------
--   • The service-role key (the admin user-management API, /api/admin/users) —
--     it bypasses RLS and carries no end-user identity, so auth.uid() is NULL.
--   • A direct/owner DB connection (migrations, manual correction) — also NULL.
--   • An admin acting through their own JWT — is_admin().
--
-- Treating "auth.uid() IS NULL" as privileged is safe here: an unauthenticated
-- caller cannot reach this trigger at all, because every profiles policy is
-- granted `to authenticated` AND requires `id = auth.uid()`, which is never
-- true when auth.uid() is NULL. So a NULL uid at UPDATE time means the writer
-- already bypassed RLS — i.e. it is the service role or the table owner.
-- ============================================================================

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

-- ── The guard ────────────────────────────────────────────────────────────────
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
