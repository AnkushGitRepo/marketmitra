#!/usr/bin/env bash
# Copies the data service's credentials from a local dotenv file into Google Secret Manager, for the Cloud Run deploy.
# RUN THIS YOURSELF: it reads credential values, and nobody else should have to see or handle them. It never prints a value.
#
#   1. cd services/fundamentals-api && vercel env pull .env.cloudrun --environment production   (gitignored; delete it afterwards)
#   2. GCP_PROJECT=<project-id> ./upload-cloud-run-secrets.sh .env.cloudrun
#
# Variables of Vercel's "Secret" type are NOT pulled (they come back empty), notably IPO_INGEST_TOKEN and SCREENER_INGEST_TOKEN. For any
# empty one this script generates a new random token and stores it in Secret Manager only, so the service can be deployed and tested
# BEFORE the cutover without touching the refresh workflows (they keep using the old tokens against the Vercel service).
#
# At cutover run it again with SET_GITHUB_SECRETS=yes: it then also sets the GitHub repo secret of the same name (needs `gh` signed in) to
# the same new value, which is what the refresh workflows must use once FUNDAMENTALS_API_URL points at Cloud Run. Values are piped, never printed.
set -euo pipefail

PROJECT="${GCP_PROJECT:?set GCP_PROJECT to the Google Cloud project id}"
ENV_FILE="${1:?usage: upload-cloud-run-secrets.sh <dotenv-file>}"
SET_GITHUB_SECRETS="${SET_GITHUB_SECRETS:-no}"

# dotenv variable -> Secret Manager secret name (a case statement, not an associative array: macOS ships bash 3.2)
secret_name() {
  case "$1" in
    DATABASE_URL) echo fundamentals-database-url ;;
    IPO_INGEST_TOKEN) echo fundamentals-ipo-ingest-token ;;
    SCREENER_INGEST_TOKEN) echo fundamentals-screener-ingest-token ;;
    KV_REST_API_URL) echo fundamentals-kv-rest-api-url ;;
    KV_REST_API_TOKEN) echo fundamentals-kv-rest-api-token ;;
  esac
}
VARS="DATABASE_URL IPO_INGEST_TOKEN SCREENER_INGEST_TOKEN KV_REST_API_URL KV_REST_API_TOKEN"
GENERATED=" IPO_INGEST_TOKEN SCREENER_INGEST_TOKEN "

value_of() { # first match of NAME=value in the dotenv file, quotes stripped; empty if absent
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | head -1 || true)"
  line="${line#*=}"; line="${line%\"}"; line="${line#\"}"; line="${line%\'}"; line="${line#\'}"
  printf '%s' "$line"
}

for var in $VARS; do
  name="$(secret_name "$var")"
  value="$(value_of "$var")"
  if [ -z "$value" ]; then
    if [[ "$GENERATED" == *" $var "* ]]; then
      value="$(openssl rand -hex 32)"
      if [ "$SET_GITHUB_SECRETS" = "yes" ]; then
        command -v gh >/dev/null || { echo "error: gh is not installed, cannot set the GitHub repo secret $var." >&2; exit 1; }
        printf '%s' "$value" | gh secret set "$var" >/dev/null
        echo "note: $var was empty in the file; generated a NEW value, stored it as secret '$name' AND set the GitHub repo secret $var."
      else
        echo "note: $var was empty in the file; generated a NEW value and stored it as secret '$name' only (GitHub secret untouched)."
      fi
    else
      echo "error: $var is empty in $ENV_FILE and cannot be generated." >&2
      exit 1
    fi
  fi
  if gcloud secrets describe "$name" --project "$PROJECT" >/dev/null 2>&1; then
    printf '%s' "$value" | gcloud secrets versions add "$name" --project "$PROJECT" --data-file=- >/dev/null
  else
    printf '%s' "$value" | gcloud secrets create "$name" --project "$PROJECT" --replication-policy=automatic --data-file=- >/dev/null
  fi
  echo "stored secret: $name"
done
echo "done. Now delete $ENV_FILE."
