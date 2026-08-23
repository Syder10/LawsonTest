#!/usr/bin/env bash
# Validation harness for the stock-ledger refactor.
# Spins an ephemeral Postgres, shims the Supabase `auth` schema, applies ALL
# migrations in order, runs ledger behavior tests, then typechecks + builds.
# Safe to re-run; cleans up its temp cluster on exit.
set -uo pipefail
# macOS + Homebrew Postgres 16 aborts startup ("postmaster became multithreaded")
# unless a valid locale is set. Force C for the whole harness.
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
MIG="$ROOT/supabase/migrations"
FAIL=0

echo "════════════════════════ 1. LOCATE POSTGRES ════════════════════════"
PGBIN=""
for d in \
  "$(brew --prefix postgresql@16 2>/dev/null)/bin" \
  "$(brew --prefix postgresql@15 2>/dev/null)/bin" \
  "$(brew --prefix postgresql@14 2>/dev/null)/bin" \
  /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@15/bin \
  /usr/local/opt/postgresql@16/bin /usr/local/opt/postgresql@15/bin \
  /Applications/Postgres.app/Contents/Versions/16/bin \
  /Applications/Postgres.app/Contents/Versions/15/bin ; do
  if [ -x "$d/initdb" ]; then PGBIN="$d"; break; fi
done
if [ -z "$PGBIN" ] && command -v initdb >/dev/null 2>&1; then PGBIN="$(dirname "$(command -v initdb)")"; fi

if [ -z "$PGBIN" ]; then
  echo "⚠️  No local Postgres found. Trying Docker…"
  if command -v docker >/dev/null 2>&1; then
    USE_DOCKER=1
  else
    echo "❌ Neither Postgres nor Docker available — SKIPPING DB validation."
    SKIP_DB=1
  fi
else
  echo "✓ Postgres at: $PGBIN ($("$PGBIN/initdb" --version))"
fi

run_sql_suite() {          # $1 = psql command prefix (array-ish string)
  local PSQL="$1"
  echo "──────────── apply migrations ────────────"
  # Supabase auth shim so the migrations' auth.uid()/auth.users references resolve.
  $PSQL -v ON_ERROR_STOP=1 <<'SQL' || return 1
do $$ begin
  if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create extension if not exists pgcrypto;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select 'authenticated'::text $$;
SQL
  for f in "$MIG"/*.sql; do
    echo "  → $(basename "$f")"
    $PSQL -v ON_ERROR_STOP=1 -q < "$f" || { echo "❌ FAILED: $(basename "$f")"; return 1; }
  done
  echo "✓ all migrations applied"

  echo "──────────── ledger behavior tests ────────────"
  $PSQL -v ON_ERROR_STOP=1 <<'SQL' || return 1
-- Baseline 200 as of 2026-08-01 (management day-one baseline).
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'alcohol', 200, 0, 'baseline');

-- Out-of-order shift entry on 2026-08-02: Morning, then Night, then LATE Afternoon.
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-08-02','Morning',  'Alcohol and Blending','alcohol',10,60);   -- 200+10-60 = 150
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-08-02','Night',    'Alcohol and Blending','alcohol', 0,30);
insert into public.stock_records (date, shift, department, material, quantity_received, quantity_used)
values ('2026-08-02','Afternoon','Alcohol and Blending','alcohol', 0,30);    -- filed LAST, belongs 2nd

do $$
declare
  o_aft numeric := public.stock_opening('alcohol','2026-08-02','Afternoon');
  o_ngt numeric := public.stock_opening('alcohol','2026-08-02','Night');
  eod   numeric := public.stock_remaining_asof('alcohol','2026-08-02');
begin
  assert o_aft = 150, format('Afternoon opening expected 150, got %s', o_aft);
  assert o_ngt = 120, format('Night opening expected 120, got %s', o_ngt);
  assert eod   =  90, format('End-of-day remaining expected 90, got %s', eod);
  raise notice 'PASS out-of-order self-heal: Aft opens %, Night opens %, EOD %', o_aft, o_ngt, eod;
end $$;

-- Reconciliation: physical count 100 on 2026-08-03 (computed would be 90 → variance +10).
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-03', null, 'alcohol', 100,
        public.stock_remaining_asof('alcohol','2026-08-03'), 'reconciliation');

do $$
declare
  v numeric; r numeric;
begin
  select variance into v from public.stock_counts where date='2026-08-03' and material='alcohol';
  r := public.stock_remaining_asof('alcohol','2026-08-03');
  assert v = 10, format('Variance expected +10, got %s', v);
  assert r = 100, format('Re-anchored remaining expected 100, got %s', r);
  raise notice 'PASS reconciliation: variance % , re-anchored remaining %', v, r;
end $$;

-- Preform ledger via blowing_daily_records (material 'preform').
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'preform', 500, 0, 'baseline');
insert into public.blowing_daily_records (date, shift, department, quantity_received_bags, preforms_used_bags)
values ('2026-08-02','Morning','Blowing', 0, 120);
do $$
declare r numeric := public.stock_remaining_asof('preform','2026-08-02');
begin
  assert r = 380, format('Preform remaining expected 380, got %s', r);
  raise notice 'PASS preform ledger: remaining %', r;
end $$;

-- stock_ledger returns per-shift running balances.
do $$
declare n int;
begin
  select count(*) into n from public.stock_ledger('alcohol','2026-08-01','2026-08-03');
  assert n = 3, format('stock_ledger expected 3 movement rows, got %s', n);
  raise notice 'PASS stock_ledger row count %', n;
end $$;

-- Tax stamps + cartons as a DERIVED ledger.
-- Baseline stamps 100000; receive 90000 more; produce 100 Bitters cartons (×9
-- stamps) + 50 Ginger (×6) = 900+300 = 1200 consumed → 100000+90000-1200 = 188800.
insert into public.stock_counts (date, shift, material, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'tax_stamp', 100000, 0, 'baseline');
insert into public.raw_materials_received (date, material_type, stamp_boxes, stamp_total_pcs)
values ('2026-08-02', 'tax_stamp', 1, 90000);
insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
values ('2026-08-03','Morning','Packaging','Bitters',100);
insert into public.packaging_daily_records (date, shift, department, product, quantity_cartons_produced)
values ('2026-08-03','Morning','Packaging','Ginger',50);
do $$
declare s numeric := public.stock_remaining_asof('tax_stamp','2026-08-03');
begin
  assert s = 188800, format('tax_stamp remaining expected 188800, got %s', s);
  raise notice 'PASS tax_stamp derived ledger: remaining %', s;
end $$;

-- Cartons are per-product. Baseline 5000 Bitters cartons, produce 100 → 4900.
insert into public.stock_counts (date, shift, material, product, counted_qty, computed_qty, kind)
values ('2026-08-01', null, 'carton', 'Bitters', 5000, 0, 'baseline');
do $$
declare c numeric := public.stock_remaining_asof('carton','2026-08-03','Bitters');
begin
  assert c = 4900, format('carton Bitters remaining expected 4900, got %s', c);
  raise notice 'PASS carton derived ledger: remaining %', c;
end $$;

-- Editing a packaging record self-corrects the derived stamp balance (no drift).
update public.packaging_daily_records set quantity_cartons_produced = 200
  where product='Bitters' and date='2026-08-03';
do $$
declare s numeric := public.stock_remaining_asof('tax_stamp','2026-08-03');
begin
  -- now 100000+90000 - (200*9 + 50*6) = 190000 - 2100 = 187900
  assert s = 187900, format('tax_stamp after edit expected 187900, got %s', s);
  raise notice 'PASS stamp self-heal on packaging edit: remaining %', s;
end $$;

select '✓✓✓ ALL LEDGER BEHAVIOR TESTS PASSED' as result;
SQL
}

if [ "${SKIP_DB:-0}" != "1" ]; then
  if [ "${USE_DOCKER:-0}" = "1" ]; then
    echo "── using Docker postgres:16 ──"
    CID=$(docker run -d -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=lawson postgres:16)
    trap 'docker rm -f "$CID" >/dev/null 2>&1' EXIT
    echo "waiting for pg…"; sleep 6
    for i in $(seq 1 20); do docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    PSQL="docker exec -i $CID psql -U postgres -d lawson"
    run_sql_suite "$PSQL" || FAIL=1
  else
    export PGDATA="$(mktemp -d)/pgdata"
    export PGPORT=$(( (RANDOM % 2000) + 55000 ))
    SOCK="$(mktemp -d)"
    "$PGBIN/initdb" -U postgres -A trust --locale=C --encoding=UTF8 "$PGDATA" >/dev/null 2>&1 || { echo "❌ initdb failed"; FAIL=1; }
    "$PGBIN/pg_ctl" -D "$PGDATA" -o "-p $PGPORT -k $SOCK -c listen_addresses=''" -w start >/dev/null 2>&1 || { echo "❌ pg_ctl start failed"; FAIL=1; }
    trap '"$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1; rm -rf "$PGDATA" "$SOCK"' EXIT
    "$PGBIN/createdb" -h "$SOCK" -p "$PGPORT" -U postgres lawson >/dev/null 2>&1
    PSQL="$PGBIN/psql -h $SOCK -p $PGPORT -U postgres -d lawson"
    run_sql_suite "$PSQL" || FAIL=1
  fi
  [ "$FAIL" = "1" ] && echo "❌ DB VALIDATION FAILED" || echo "✅ DB VALIDATION PASSED"
fi

echo "════════════════════════ 2. TYPECHECK ════════════════════════"
if [ "${SKIP_APP:-0}" = "1" ]; then echo "(skipped)"; else
npx tsc --noEmit 2>&1 | tail -40
TSC=${PIPESTATUS[0]}
[ "$TSC" = "0" ] && echo "✅ tsc: 0 errors" || { echo "❌ tsc failed"; FAIL=1; }
fi

echo "════════════════════════ 3. BUILD ════════════════════════"
if [ "${SKIP_APP:-0}" = "1" ]; then echo "(skipped)"; else
npm run build 2>&1 | tail -30
BUILD=${PIPESTATUS[0]}
[ "$BUILD" = "0" ] && echo "✅ next build ok" || { echo "❌ build failed"; FAIL=1; }
fi

echo "════════════════════════ SUMMARY ════════════════════════"
[ "$FAIL" = "0" ] && echo "🎉 ALL GATES PASSED" || echo "⚠️  SOME GATES FAILED (see above)"
exit $FAIL
