-- ============================================================================
-- diagnose-login.sql
--
-- Run in the Supabase SQL editor when a login fails even though
-- `select * from profiles` clearly shows the row.
--
-- THE KEY IDEA: the SQL editor connects as the table OWNER, which BYPASSES RLS.
-- The app connects as `authenticated` WITH RLS. So a profile you can see here
-- may still be invisible to the app. Section 3 impersonates your user to test
-- the read the app actually performs.
-- ============================================================================

-- ── 1. Does the row exist at all? (owner view, RLS bypassed) ────────────────
select u.id, u.email, p.role, p.department,
       case when p.id is null then 'NO PROFILE ROW' else 'profile exists' end as row_state
from auth.users u
left join public.profiles p on p.id = u.id
order by u.email;

-- ── 2. Is RLS on, and which policies apply to SELECT? ───────────────────────
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class where oid = 'public.profiles'::regclass;

-- Expect a SELECT policy named profiles_select, roles={authenticated},
-- qual = (id = auth.uid() OR is_staff()).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles'
order by cmd, policyname;

-- ── 3. THE REAL TEST — read the profile AS the signed-in user ───────────────
-- Impersonates `authenticated` with your user's JWT claim, so RLS applies
-- exactly as it does in the app.
--
--   >>> PUT YOUR user id (from section 1) IN BOTH PLACES BELOW <<<
do $$
declare
  v_user   uuid := 'PASTE_USER_ID_HERE';   -- <<< EDIT
  v_owner  int;
  v_rls    int;
  v_denied boolean := false;
begin
  select count(*) into v_owner from public.profiles where id = v_user;

  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    select count(*) into v_rls from public.profiles where id = v_user;
  exception when insufficient_privilege then
    -- No table-level SELECT grant: RLS runs AFTER grants, so no policy can help.
    v_denied := true;
    v_rls := 0;
  end;
  reset role;

  raise notice '─────────────────────────────────────────────';
  raise notice 'rows visible as OWNER (RLS bypassed): %', v_owner;
  if v_denied then
    raise notice 'rows visible as the USER  (RLS on)  : PERMISSION DENIED';
  else
    raise notice 'rows visible as the USER  (RLS on)  : %', v_rls;
  end if;

  if v_denied then
    raise notice 'VERDICT: `authenticated` has no SELECT grant on public.profiles.';
    raise notice '         Grants are checked BEFORE RLS, so no policy can let this';
    raise notice '         through. Fix (section 4 below):';
    raise notice '           grant usage on schema public to authenticated, anon;';
    raise notice '           grant select, insert, update on public.profiles to authenticated;';
  elsif v_owner = 0 then
    raise notice 'VERDICT: no profile row at all -> run bootstrap-admin.sql';
  elsif v_rls = 0 then
    raise notice 'VERDICT: the row EXISTS but RLS hides it from its own user.';
    raise notice '         The profiles_select policy is missing or wrong (section 2),';
    raise notice '         or is_staff()/is_admin() are absent (0001 not applied).';
    raise notice '         Re-apply 0003_profiles.sql.';
  else
    raise notice 'VERDICT: the row is readable by the app. If login still fails,';
    raise notice '         the deployed build is stale, or it points at a DIFFERENT';
    raise notice '         Supabase project than this one (check NEXT_PUBLIC_SUPABASE_URL).';
  end if;
  raise notice '─────────────────────────────────────────────';
end $$;

-- ── 4. Does `authenticated` even hold table-level SELECT? ───────────────────
-- RLS runs AFTER grants: without SELECT here, no policy can ever let a read
-- through. A schema rebuild that missed Supabase's default grants causes this.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('authenticated', 'anon', 'service_role')
order by grantee, privilege_type;

-- ── FIXES ───────────────────────────────────────────────────────────────────
-- Missing grants (section 4 shows no SELECT for `authenticated`):
--   grant usage on schema public to authenticated, anon;
--   grant select, insert, update on public.profiles to authenticated;
--
-- Missing/incorrect policy (section 2 shows no profiles_select):
--   re-apply supabase/migrations/0003_profiles.sql, or just:
--   drop policy if exists "profiles_select" on public.profiles;
--   create policy "profiles_select" on public.profiles for select to authenticated
--     using (id = auth.uid() or public.is_staff());
--
-- is_staff()/is_admin() missing (0001 not applied) would also break the policy:
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname in ('is_staff','is_admin');
