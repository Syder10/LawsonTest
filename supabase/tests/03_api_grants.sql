-- ============================================================================
-- supabase/tests/03_api_grants.sql
--
-- Regression tests for 0005_ledger_and_grants.sql.
--
-- These exist because a missing `grant usage on schema public` took the whole app
-- down with a misleading symptom: every PostgREST request failed with
-- "42501 permission denied for schema public", while the SQL editor worked fine
-- (it connects as the schema OWNER, which needs no grants). The app reported it
-- as "no profile configured for this account", sending the diagnosis in entirely
-- the wrong direction.
--
-- Root cause: `drop schema public cascade; create schema public;` destroys
-- Supabase's default grants and never restores them.
-- ============================================================================

-- ── The grants PostgREST cannot work without ─────────────────────────────────
do $$
begin
  assert has_schema_privilege('authenticated', 'public', 'usage'),
    'authenticated lacks USAGE on schema public — EVERY request would fail with 42501';
  assert has_schema_privilege('anon', 'public', 'usage'),
    'anon lacks USAGE on schema public';
  assert has_schema_privilege('service_role', 'public', 'usage'),
    'service_role lacks USAGE on schema public — the admin/service paths would fail';

  assert has_table_privilege('authenticated', 'public.profiles', 'select'),
    'authenticated lacks SELECT on profiles — login cannot read the caller''s own profile';
  assert has_table_privilege('authenticated', 'public.stock_records', 'insert'),
    'authenticated lacks INSERT on stock_records — supervisors could not submit';
  assert has_table_privilege('service_role', 'public.profiles', 'select'),
    'service_role lacks SELECT on profiles';

  raise notice 'PASS API roles hold schema usage + table privileges';
end $$;

-- ── The invariant those grants depend on ─────────────────────────────────────
-- Table privileges are granted broadly to anon/authenticated on the explicit
-- assumption that RLS is the real boundary. A new table without RLS would be
-- fully readable by anyone holding the public anon key.
do $$
declare v_norls text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into v_norls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

  assert v_norls is null, format(
    'these public tables have NO RLS but are granted to anon/authenticated: %s', v_norls);
  raise notice 'PASS every public table has RLS enabled';
end $$;

-- ── RLS, not the grant, is what limits anon ──────────────────────────────────
-- anon holds SELECT on profiles, so this must return ZERO ROWS *without error*.
-- An error here would mean grants are broken; rows here would mean RLS is.
do $$
declare n int;
begin
  set local role anon;
  select count(*) into n from public.profiles;
  reset role;
  assert n = 0, format('anon must see no profiles, saw %s', n);
  raise notice 'PASS anon can reach profiles but RLS yields zero rows';
end $$;

-- ── SECURITY DEFINER stock functions must NOT be callable by anon ────────────
-- Postgres grants EXECUTE to PUBLIC on every new function by default, and anon
-- belongs to PUBLIC — so omitting anon from a GRANT achieves nothing; 0005 has to
-- REVOKE explicitly. These functions bypass RLS by design, and the anon key is
-- embedded in the browser bundle, so without the revoke anyone reading the
-- JavaScript could read live stock balances and the full movement ledger.
do $$
declare
  blocked boolean;
  fns text[] := array[
    'select public.stock_remaining_asof(''alcohol'', ''2026-08-31'')',
    'select public.stock_opening(''alcohol'', ''2026-08-31'', ''Morning'')',
    'select count(*) from public.finished_goods_stock()',
    'select count(*) from public.stock_ledger(''alcohol'', ''2026-08-01'', ''2026-08-31'')'
  ];
  stmt text;
begin
  foreach stmt in array fns loop
    blocked := false;
    begin
      set local role anon;
      execute stmt;
    exception when insufficient_privilege then
      blocked := true;
    end;
    reset role;
    assert blocked, format(
      'SECURITY: anon can execute [%s] — it is SECURITY DEFINER, so stock data is public', stmt);
  end loop;
  raise notice 'PASS anon cannot execute any SECURITY DEFINER stock function';
end $$;

-- ── …but authenticated still can (the app depends on it) ─────────────────────
do $$
declare v numeric; n int;
begin
  set local role authenticated;
  v := public.stock_remaining_asof('alcohol', '2026-08-31');
  select count(*) into n from public.finished_goods_stock();
  reset role;
  assert v is not null, 'authenticated must be able to call stock_remaining_asof';
  raise notice 'PASS authenticated can still call the stock functions (balance %, % product rows)', v, n;
end $$;

select '✓ 03_api_grants.sql — Data API grants + SECURITY DEFINER lockdown verified' as result;
