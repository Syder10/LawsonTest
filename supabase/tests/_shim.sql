-- ============================================================================
-- supabase/tests/_shim.sql
--
-- TEST-ONLY stand-in for the parts of Supabase's managed `auth` schema that the
-- migrations reference. Applied BEFORE the migrations by scripts/validate-ledger.sh
-- and by .github/workflows/ci.yml. Never applied to a real Supabase project,
-- where all of this already exists.
--
-- Tests choose the "current user" by setting the JWT claim that auth.uid() reads:
--     set request.jwt.claim.sub = '<uuid>';   -- act as that signed-in user
--     set request.jwt.claim.sub = '';         -- act as service-role / table owner
-- ============================================================================

do $$ begin
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='anon')          then create role anon;          end if;
  if not exists (select from pg_roles where rolname='service_role')  then create role service_role;  end if;
end $$;

create schema if not exists auth;
create extension if not exists pgcrypto;

-- raw_user_meta_data is required: handle_new_user() (0003) reads full_name /
-- role / department / group_number out of it to auto-provision the profile.
create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb,
  created_at         timestamptz not null default now()
);

create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')::text $$;
