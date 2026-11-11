#!/usr/bin/env bash
# Post-deploy smoke test. Usage: scripts/smoke-test.sh [app_url] [fundamentals_url]
# Exits non-zero if any check fails. Public endpoints only; no secrets needed.
set -u

APP="${1:-https://marketmitra-v2.vercel.app}"
FUND="${2:-https://marketmitra-fundamentals-api.vercel.app}"
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
check "fundamentals-api health"      "$FUND/health"               200
# Operator-only routes must reject anonymous callers (security hardening, ADR 0032).
check "system logs closed to anon"   "$APP/api/system/logs"       401

exit "$fail"
