# 0060 — The fundamentals data service moves to Google Cloud Run

Status: accepted (2026-11-12, issue #169); **cutover done 2026-11-12** (the app uses Cloud Run; the Vercel data service stays idle as a backup for about a week). Supersedes the hosting parts of [0011](./0011-three-tier-fundamentals-data-sourcing.md) and [0013](./0013-fundamentals-api-vercel-hosting.md) once the cutover is done.

## Context

On the Vercel Hobby account, Fluid Active CPU for the last 30 days was 4h 28m against 4h included, and `marketmitra-fundamentals-api` was 4h 01m of it (90%), almost all of it `GET /companies/{symbol}/prices` (5-year history, about 0.5 s of CPU per call, 25% cold starts). The Next app was 26m 47s. The service is a standalone FastAPI app, a good fit for a container.

## Decision

- Run the data service on **Google Cloud Run** in `us-east4` (Northern Virginia), next to the Neon database (Washington, D.C.) and the Vercel app (`iad1`), so there is no new cross-region latency. Scale to zero, 1 CPU, 2 GiB, at most 3 instances, public with the existing app-level rate limit (Upstash).
- **Cutover is a configuration change:** `FUNDAMENTALS_API_URL` in the `marketmitra-v2` Vercel production environment and in the GitHub repo variable of the same name (used by the refresh workflows). The Vercel copy stays deployed but idle as a rollback (an idle deployment uses no CPU), is not changed after the cutover, and is deleted or paused after about a week of clean running. Both use the same Neon database and Upstash store.
- Secrets live in Google Secret Manager and are passed to the service by name. A maintainer runs the upload script; no agent handles the values.
- Cloud Run does not compress responses (Vercel's edge did, with brotli), so the service gzips JSON over 1 KB itself: a 5-year price series is about 187 KB.
- Cloud Run behind Google's front end changes how the client IP arrives, so on Cloud Run (`K_SERVICE`) the rate limiter uses the last `X-Forwarded-For` hop.

## Consequences

- The Vercel allowance is free for other projects (the app alone is about 0.5 h a month).
- A second place to operate: logs and metrics are in Google Cloud Logging and Monitoring, not the Vercel dashboard. Cold starts after idle remain (min instances 0).
- Credits: the Free Trial credit expired on 2024-03-07. What is available is the Google Developer Program monthly credits (about ₹6,400 in total at the time of writing, each valid for a year). A small Cloud Run service is expected to stay near the free tier; a budget alert is set before the first deploy.
- Docker keeps lock-in low: the same container runs anywhere, including Cloud Run alternatives or self-hosting.

## Security review (2026-11-12)

A black-box probe of the public service plus a review of the Google Cloud project, the repository, the secrets and the dependencies.

- **Passed:** every write endpoint (`/embed`, `/documents/extract-text`, `/ipos/ingest`, `/screener/ingest`, `/screener/quotes`) answers 401 for no token, a wrong token and a wrong scheme (the check fails closed with 503 if a token is not configured, and compares in constant time); per-IP rate limiting enforced (25 of 150 requests rejected) and **not dodged by a forged `X-Forwarded-For`**; sensitive paths 404; no CORS exposure; security headers present; secrets are Secret Manager references with no public binding and the image repository is private; `npm audit --omit=dev` and `pip-audit` report nothing; bandit found no high severity issue; no real secret in the git history (all branches) or in the public JavaScript bundles; the only browser-visible variables are Clerk's publishable key and the deployment mode; all 32 app endpoints declared as protected refuse anonymous callers; GitHub secret scanning, push protection and Dependabot are on.
- **Found and fixed:**
  1. An invalid symbol (a NUL byte, a 5,000-character string) returned a 502 whose body contained the SQL statement and driver error, and the long one took 7 s. Symbols are now validated at the boundary (`^[A-Za-z0-9&._-]{1,30}$`, else 422) and an upstream failure returns a generic message with the cause only in the server log.
  2. **Any anonymous request for an unknown, valid-looking symbol made the service call NSE, BSE and yfinance and insert a company row** (a way to fill the database and burn upstream quota). A company is now created only if it already exists or is in `company_master`, the NSE listing refreshed daily by the screener job; otherwise 404 and nothing is written. A very new listing may 404 until the next refresh.
  3. The service ran as the project's default compute service account, which held the broad `Editor` role. It now runs as `fundamentals-runtime`, which can read only the five secrets it needs (granted per secret). The default account lost `Editor` and its project-wide secret access. It is also the **build** identity for source deploys, and a rebuild then failed twice until it had exactly three narrow permissions, which `deploy-cloud-run.sh` now grants idempotently: `artifactregistry.writer` and `logging.logWriter` on the project, and `storage.objectViewer` on the `run-sources-…` bucket only. A rebuild with these succeeded.
  4. `/docs`, `/redoc` and `/openapi.json` listed the endpoint inventory publicly; they are hidden when `K_SERVICE` is set (Cloud Run).
- **Accepted residual risk:** the service is public by design (the data is public) and has no WAF (Cloud Armor needs a paid load balancer). A distributed layer-7 flood can still make it unavailable; cost and blast radius are bounded by the per-IP limit, at most 3 instances, concurrency 20 and a ₹1,500 budget alert (which notifies and does not stop spend). If the rate limiter's Upstash store is exhausted the limiter degrades. Non-standard HTTP methods such as `TRACK` get a 502 from Google's front end (harmless).
- **Follow-ups:** delete the junk company rows the probe created (see the handoff), rotate the Neon database password after the old Vercel project is deleted, mark the Upstash variables as sensitive in Vercel, and consider restricting the service to the app with a Google identity token if public exposure ever becomes a problem.

