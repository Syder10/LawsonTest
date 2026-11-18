#!/usr/bin/env bash
# Proves the consolidated migration set in supabase/migrations-next/ produces a
# schema IDENTICAL to the legacy set in supabase/migrations/.
#
# Applies each set to its own throwaway database on one ephemeral Postgres, then
# compares four independent projections:
#   1. structure      (pg_dump --schema-only, normalised)
#   2. privileges     (table grants, RLS flags, policies, schema + function grants)
#   3. seed data      (reference rows the app depends on)
#   4. function bodies (md5 of pg_get_functiondef for every public function)
#
# All four must be IDENTICAL before the squash is allowed to replace the originals.
# Usage: bash scripts/verify-squash.sh
set -uo pipefail
export LC_ALL=C LANG=C
cd "$(dirname "$0")/.." || exit 1

OLD_DIR="supabase/migrations"
NEW_DIR="supabase/migrations-next"
FAIL=0

PGBIN=""
for d in \
  "$(brew --prefix postgresql@16 2>/dev/null)/bin" \
  /usr/local/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@16/bin \
  /usr/local/opt/postgresql@15/bin /opt/homebrew/opt/postgresql@15/bin ; do
  [ -x "$d/initdb" ] && { PGBIN="$d"; break; }
done
[ -z "$PGBIN" ] && command -v initdb >/dev/null 2>&1 && PGBIN="$(dirname "$(command -v initdb)")"
if [ -z "$PGBIN" ]; then echo "No local Postgres found."; exit 1; fi

D="$(mktemp -d)"; SOCK="$(mktemp -d)"
PORT=$(( (RANDOM % 2000) + 55000 ))
"$PGBIN/initdb" -U postgres -A trust --locale=C --encoding=UTF8 "$D/pg" >/dev/null 2>&1
"$PGBIN/pg_ctl" -D "$D/pg" -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null 2>&1
trap '"$PGBIN/pg_ctl" -D "$D/pg" -m immediate stop >/dev/null 2>&1; rm -rf "$D" "$SOCK"' EXIT

PSQL_BASE="$PGBIN/psql -h $SOCK -p $PORT -U postgres"

apply() {   # $1 = dbname, $2 = migration dir
  "$PGBIN/createdb" -h "$SOCK" -p "$PORT" -U postgres "$1" >/dev/null 2>&1
  $PSQL_BASE -d "$1" -q -v ON_ERROR_STOP=1 -f supabase/tests/_shim.sql >/dev/null 2>&1 \
    || { echo "  shim failed on $1"; return 1; }
  local f
  for f in "$2"/*.sql; do
    if ! $PSQL_BASE -d "$1" -q -v ON_ERROR_STOP=1 -f "$f" > "$D/apply.log" 2>&1; then
      echo "  FAILED: $(basename "$f")"; tail -6 "$D/apply.log"; return 1
    fi
  done
}

echo "── applying legacy set ($(ls "$OLD_DIR"/*.sql | wc -l | tr -d ' ') files) ──"
apply old "$OLD_DIR" || exit 1
echo "  ok"
echo "── applying consolidated set ($(ls "$NEW_DIR"/*.sql | wc -l | tr -d ' ') files) ──"
apply new "$NEW_DIR" || exit 1
echo "  ok"

check() {   # $1 = label, $2 = old file, $3 = new file, $4 = unit noun
  if diff -u "$2" "$3" > "$D/diff.txt"; then
    printf '  PASS  %-34s %s %s\n' "$1" "$(wc -l < "$2" | tr -d ' ')" "$4"
  else
    printf '  FAIL  %s\n' "$1"; head -50 "$D/diff.txt"; FAIL=1
  fi
}

structure() {
  # pg_dump (PG16.x) wraps output in \restrict/\unrestrict guards carrying a
  # random per-dump nonce — strip them or no two dumps could ever compare equal.
  "$PGBIN/pg_dump" -h "$SOCK" -p "$PORT" -U postgres --schema-only --schema=public \
    --no-owner --no-privileges -d "$1" \
    | grep -v '^--' | grep -v '^$' | grep -v '^SET ' | grep -v '^SELECT pg_catalog' \
    | grep -v '^\\restrict' | grep -v '^\\unrestrict'
}

privileges() {
  $PSQL_BASE -d "$1" -At -F'|' -c "
    select 'tablepriv',grantee,table_name,privilege_type from information_schema.role_table_grants
      where table_schema='public' and grantee in ('anon','authenticated','service_role','postgres')
    union all select 'rls',relname,relrowsecurity::text,'' from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
    union all select 'policy',tablename,policyname,cmd from pg_policies where schemaname='public'
    union all select 'schemapriv',r.rolname,has_schema_privilege(r.rolname,'public','usage')::text,''
      from pg_roles r where r.rolname in ('anon','authenticated','service_role')
    union all select 'fnpriv',p.proname,r.rolname,has_function_privilege(r.rolname,p.oid,'execute')::text
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join pg_roles r
      where n.nspname='public' and r.rolname in ('anon','authenticated')
    order by 1,2,3,4;"
}

seeds() {
  $PSQL_BASE -d "$1" -At -F'|' -c "
    select 'dept',name,code,num_groups::text from departments
    union all select 'mat',code,name,unit from stock_materials
    union all select 'cons',code,name,coalesce(pcs_per_box::text,'-') from consumable_materials
    union all select 'bom',product::text,stamps_per_carton::text,cartons_per_carton::text from packaging_bom
    union all select 'cstock',material,coalesce(product::text,'-'),remaining_pcs::text from consumable_stock
    order by 1,2,3;"
}

functions() {
  $PSQL_BASE -d "$1" -At -c "
    select p.proname||'|'||md5(pg_get_functiondef(p.oid)) from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by 1;"
}

echo ""
echo "════════ four independent comparisons ════════"
structure  old > "$D/o1"; structure  new > "$D/n1"; check "structure (pg_dump)"        "$D/o1" "$D/n1" "lines"
privileges old > "$D/o2"; privileges new > "$D/n2"; check "privileges / RLS / policies" "$D/o2" "$D/n2" "facts"
seeds      old > "$D/o3"; seeds      new > "$D/n3"; check "seed data"                   "$D/o3" "$D/n3" "rows"
functions  old > "$D/o4"; functions  new > "$D/n4"; check "function bodies (md5)"       "$D/o4" "$D/n4" "functions"

echo ""
if [ "$FAIL" = "0" ]; then
  echo "SQUASH VERIFIED — the consolidated set is schema-identical."
else
  echo "SQUASH NOT SAFE — resolve the differences above before swapping."
fi
exit $FAIL
