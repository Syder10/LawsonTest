-- ============================================================================
-- verify-install.sql
--
-- Paste into the Supabase SQL editor to confirm which migrations actually landed
-- on THIS database. Applying only some of the five files leaves the app working
-- while the security fixes are silently absent, which is easy to miss.
--
-- Every row should read INSTALLED / none / a list of admins.
-- ============================================================================

select 'auto-provision profile trigger (0003)' as item,
       case when exists (
              select 1 from pg_trigger
              where not tgisinternal and tgname = 'on_auth_user_created')
            then 'INSTALLED'
            else 'MISSING — new auth users get no profile row and cannot sign in'
       end as status

union all
select 'derived stock ledger (0005)',
       case when exists (
              select 1 from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'stock_balance_core')
            then 'INSTALLED'
            else 'MISSING — stock balances cannot be computed'
       end

union all
select 'profile privilege guard (0003)',
       case when exists (
              select 1 from pg_trigger
              where not tgisinternal and tgname = 'profiles_guard_privileged_columns')
            then 'INSTALLED'
            else 'MISSING — a supervisor can still promote themselves to admin'
       end

union all
select 'duplicate-submission guards (0004)',
       case when (select count(*) from pg_indexes
                   where schemaname = 'public'
                     and indexname like '%\_one\_per\_shift\_uidx') = 8
            then 'INSTALLED (8 of 8 indexes)'
            else 'INCOMPLETE — ' || (select count(*) from pg_indexes
                                      where schemaname = 'public'
                                        and indexname like '%\_one\_per\_shift\_uidx')::text
                 || ' of 8 indexes; duplicate records can double-count stock'
       end

union all
select 'hardened user provisioning (0003)',
       case when coalesce((
              select pg_get_functiondef(p.oid) from pg_proc p
              join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'handle_new_user'
              limit 1), '') like '%invalid_text_representation%'
            then 'INSTALLED'
            else 'MISSING — invalid role/department metadata can abort user creation'
       end

union all
select 'auth users without a profile',
       case when (select count(*) from auth.users u
                   left join public.profiles p on p.id = u.id
                   where p.id is null) = 0
            then 'none'
            else (select count(*) from auth.users u
                   left join public.profiles p on p.id = u.id
                   where p.id is null)::text || ' — run bootstrap-admin.sql'
       end

union all
select 'admin accounts',
       coalesce((select string_agg(email, ', ' order by email)
                 from public.profiles where role = 'admin'),
                'NONE — run bootstrap-admin.sql');
