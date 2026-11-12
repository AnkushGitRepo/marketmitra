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

# Public like the Vercel deployment (the app-level rate limit still applies); 1 CPU and 2 GiB for onnxruntime; scale to zero;
# at most 3 instances so a burst cannot open many database connections or run up cost.
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
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
