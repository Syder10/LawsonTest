#!/usr/bin/env bash
# Full validation harness.
#
#   1. DB      — ephemeral Postgres, auth shim, ALL migrations, SQL behaviour suites
#   2. UNIT    — vitest over the pure domain logic in lib/
#   3. TYPES   — tsc --noEmit
#   4. BUILD   — next build
#
# The SQL suites live in supabase/tests/ (shared verbatim with CI — see
# .github/workflows/ci.yml) so the two can never drift.
# Safe to re-run; cleans up its temp cluster on exit.
#
# Env toggles:  SKIP_DB=1  SKIP_APP=1  SKIP_BUILD=1
set -uo pipefail
# macOS + Homebrew Postgres 16 aborts startup ("postmaster became multithreaded")
# unless a valid locale is set. Force C for the whole harness.
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.." || exit 1
ROOT="$(pwd)"
MIG="$ROOT/supabase/migrations"
TESTS="$ROOT/supabase/tests"
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

  echo "──────────── auth shim ────────────"
  # Stands in for Supabase's managed auth schema (auth.uid(), auth.users) so the
  # migrations resolve. Test-only; never applied to a real project.
  $PSQL -v ON_ERROR_STOP=1 -q < "$TESTS/_shim.sql" || return 1

  echo "──────────── apply migrations ────────────"
  for f in "$MIG"/*.sql; do
    echo "  → $(basename "$f")"
    $PSQL -v ON_ERROR_STOP=1 -q < "$f" || { echo "❌ FAILED: $(basename "$f")"; return 1; }
  done
  echo "✓ all migrations applied"

  echo "──────────── SQL behaviour suites ────────────"
  for f in "$TESTS"/[0-9][0-9]_*.sql; do
    echo "  → $(basename "$f")"
    $PSQL -v ON_ERROR_STOP=1 < "$f" || { echo "❌ FAILED: $(basename "$f")"; return 1; }
  done
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

echo "════════════════════════ 2. UNIT TESTS ════════════════════════"
if [ "${SKIP_APP:-0}" = "1" ]; then echo "(skipped)"; else
npx vitest run --reporter=dot 2>&1 | tail -25
VITEST=${PIPESTATUS[0]}
[ "$VITEST" = "0" ] && echo "✅ vitest passed" || { echo "❌ vitest failed"; FAIL=1; }
fi

echo "════════════════════════ 3. TYPECHECK ════════════════════════"
if [ "${SKIP_APP:-0}" = "1" ]; then echo "(skipped)"; else
npx tsc --noEmit 2>&1 | tail -40
TSC=${PIPESTATUS[0]}
[ "$TSC" = "0" ] && echo "✅ tsc: 0 errors" || { echo "❌ tsc failed"; FAIL=1; }
fi

echo "════════════════════════ 4. BUILD ════════════════════════"
if [ "${SKIP_APP:-0}" = "1" ] || [ "${SKIP_BUILD:-0}" = "1" ]; then echo "(skipped)"; else
npm run build 2>&1 | tail -30
BUILD=${PIPESTATUS[0]}
[ "$BUILD" = "0" ] && echo "✅ next build ok" || { echo "❌ build failed"; FAIL=1; }
fi

echo "════════════════════════ SUMMARY ════════════════════════"
[ "$FAIL" = "0" ] && echo "🎉 ALL GATES PASSED" || echo "⚠️  SOME GATES FAILED (see above)"
exit $FAIL
