#!/usr/bin/env bash
# Verification for the redesign work in progress.
#   bash scripts/check.sh          types + unit tests
#   bash scripts/check.sh full     the above plus build
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
FAIL=0

echo "──────── typecheck ────────"
npx tsc --noEmit 2>&1 | head -40
[ "${PIPESTATUS[0]}" = "0" ] && echo "tsc: 0 errors" || { echo "tsc FAILED"; FAIL=1; }

echo "──────── unit tests ────────"
npx vitest run --reporter=dot 2>&1 | tail -20
[ "${PIPESTATUS[0]}" = "0" ] && echo "vitest passed" || { echo "vitest FAILED"; FAIL=1; }

if [ "${1:-}" = "full" ]; then
  echo "──────── build ────────"
  npm run build 2>&1 | tail -25
  [ "${PIPESTATUS[0]}" = "0" ] && echo "build ok" || { echo "build FAILED"; FAIL=1; }
fi

echo "════════════════════════════"
[ "$FAIL" = "0" ] && echo "ALL CHECKS PASSED" || echo "SOME CHECKS FAILED"
exit $FAIL
