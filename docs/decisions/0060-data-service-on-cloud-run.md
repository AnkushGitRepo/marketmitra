# 0060 — The fundamentals data service moves to Google Cloud Run

Status: accepted (2026-11-12, issue #169); implementation in progress. Supersedes the hosting parts of [0011](./0011-three-tier-fundamentals-data-sourcing.md) and [0013](./0013-fundamentals-api-vercel-hosting.md) once the cutover is done.

## Context

On the Vercel Hobby account, Fluid Active CPU for the last 30 days was 4h 28m against 4h included, and `marketmitra-fundamentals-api` was 4h 01m of it (90%), almost all of it `GET /companies/{symbol}/prices` (5-year history, about 0.5 s of CPU per call, 25% cold starts). The Next app was 26m 47s. The service is a standalone FastAPI app, a good fit for a container.

## Decision

- Run the data service on **Google Cloud Run** in `us-east4` (Northern Virginia), next to the Neon database (Washington, D.C.) and the Vercel app (`iad1`), so there is no new cross-region latency. Scale to zero, 1 CPU, 2 GiB, at most 3 instances, public with the existing app-level rate limit (Upstash).
- **Cutover is a configuration change:** `FUNDAMENTALS_API_URL` in the `marketmitra-v2` Vercel production environment and in the GitHub repo variable of the same name (used by the refresh workflows). The Vercel copy stays deployed but idle as a rollback (an idle deployment uses no CPU), is not changed after the cutover, and is deleted or paused after about a week of clean running. Both use the same Neon database and Upstash store.
- Secrets live in Google Secret Manager and are passed to the service by name. A maintainer runs the upload script; no agent handles the values.
- Cloud Run behind Google's front end changes how the client IP arrives, so on Cloud Run (`K_SERVICE`) the rate limiter uses the last `X-Forwarded-For` hop.

## Consequences

- The Vercel allowance is free for other projects (the app alone is about 0.5 h a month).
- A second place to operate: logs and metrics are in Google Cloud Logging and Monitoring, not the Vercel dashboard. Cold starts after idle remain (min instances 0).
- Credits: the Free Trial credit expired on 2024-03-07. What is available is the Google Developer Program monthly credits (about ₹6,400 in total at the time of writing, each valid for a year). A small Cloud Run service is expected to stay near the free tier; a budget alert is set before the first deploy.
- Docker keeps lock-in low: the same container runs anywhere, including Cloud Run alternatives or self-hosting.
