#!/usr/bin/env bash
# Post-deploy smoke test. Usage: scripts/smoke-test.sh [app_url] [fundamentals_url]
# Without a fundamentals_url it checks the app's own /api/status, which probes whichever data service the app is configured to use.
# Exits non-zero if any check fails. Public endpoints only; no secrets needed.
set -u

APP="${1:-https://marketmitra-v2.vercel.app}"
FUND="${2:-}"
fail=0

# check <label> <url> <expected-status>
check() {
  local code
  code=$(curl -s -o /dev/null -m 30 -w "%{http_code}" "$2") || code="000"
  if [ "$code" = "$3" ]; then
    echo "ok    $1 ($code)"
  else
    echo "FAIL  $1: expected $3, got $code ($2)"
    fail=1
  fi
}

check "landing page"                 "$APP/"                      200
check "stock aggregate API"          "$APP/api/stock/TCS"         200
check "version endpoint"             "$APP/api/version"           200
if [ -n "$FUND" ]; then
  check "fundamentals-api health"    "$FUND/health"               200
else
  # The app's status page probes the data service it actually uses (Cloud Run since ADR 0060), so every component must be operational.
  if curl -s -m 30 "$APP/api/status" | python3 -c 'import sys,json; c=json.load(sys.stdin)["data"]["components"]; sys.exit(0 if c and all(x.get("status")=="operational" for x in c) else 1)' 2>/dev/null; then
    echo "ok    status components operational (incl. the data service)"
  else
    echo "FAIL  status components: not all operational ($APP/api/status)"
    fail=1
  fi
fi
# Operator-only routes must reject anonymous callers (security hardening, ADR 0032).
check "system logs closed to anon"   "$APP/api/system/logs"       401

exit "$fail"
