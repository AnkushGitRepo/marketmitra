#!/usr/bin/env bash
# Deploys the data service to Google Cloud Run from source (Cloud Build builds the container; no local Docker needed).
# Needs the maintainer's go-ahead. Secrets are referenced by NAME from Secret Manager: no value is passed or printed here.
#
#   GCP_PROJECT=<project-id> ./deploy-cloud-run.sh            # region defaults to us-east4 (next to Neon and the Vercel app, iad1)
#
# Create the secrets first with ./upload-cloud-run-secrets.sh. Both scripts only call gcloud.
set -euo pipefail

PROJECT="${GCP_PROJECT:?set GCP_PROJECT to the Google Cloud project id}"
REGION="${GCP_REGION:-us-east4}"
SERVICE="${CLOUD_RUN_SERVICE:-marketmitra-fundamentals}"

cd "$(dirname "$0")"

# Least privilege (ADR 0060): the service runs as its OWN service account that can read only the five secrets it needs. The project's default
# compute service account holds the broad Editor role and must never be the runtime identity of a public service. Idempotent.
RUNTIME_SA_NAME="${CLOUD_RUN_SA:-fundamentals-runtime}"
RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
SECRETS="fundamentals-database-url fundamentals-ipo-ingest-token fundamentals-screener-ingest-token fundamentals-kv-rest-api-url fundamentals-kv-rest-api-token"
gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT" >/dev/null 2>&1 \
  || gcloud iam service-accounts create "$RUNTIME_SA_NAME" --project "$PROJECT" --display-name "Fundamentals data service (runtime, least privilege)"
# The build runs as the project's default compute service account. It must NOT hold the broad Editor role; these two narrow roles are what a
# source deploy needs after the build steps (push the image, write the build log). Idempotent.
BUILD_SA="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for role in roles/artifactregistry.writer roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:${BUILD_SA}" --role "$role" --condition=None >/dev/null
done

# A service account created a moment ago is not visible to IAM everywhere yet ("does not exist"), so each grant retries for up to a minute.
for secret in $SECRETS; do
  attempt=0
  until gcloud secrets add-iam-policy-binding "$secret" --project "$PROJECT" --member "serviceAccount:${RUNTIME_SA}" \
      --role roles/secretmanager.secretAccessor --condition=None >/dev/null 2>&1; do
    attempt=$((attempt + 1))
    [ "$attempt" -ge 12 ] && { echo "could not grant ${RUNTIME_SA} access to ${secret}" >&2; exit 1; }
    sleep 5
  done
done

# Public like the Vercel deployment (the app-level rate limit still applies); 1 CPU and 2 GiB for onnxruntime; scale to zero;
# at most 3 instances so a burst cannot open many database connections or run up cost.
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --service-account "$RUNTIME_SA" \
  --cpu 1 \
  --memory 2Gi \
  --min-instances 0 \
  --max-instances 3 \
  --concurrency 20 \
  --timeout 120 \
  --cpu-boost \
  --set-env-vars "NSE_REQUESTS_PER_SECOND=3.0,TIER3_ENABLED=true,FINANCIALS_TIER1_ENABLED=true,LOG_LEVEL=INFO,RATE_LIMIT_PER_MINUTE=120" \
  --set-secrets "DATABASE_URL=fundamentals-database-url:latest,IPO_INGEST_TOKEN=fundamentals-ipo-ingest-token:latest,SCREENER_INGEST_TOKEN=fundamentals-screener-ingest-token:latest,KV_REST_API_URL=fundamentals-kv-rest-api-url:latest,KV_REST_API_TOKEN=fundamentals-kv-rest-api-token:latest"

gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)'
