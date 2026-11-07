# Deployment

MarketMitra deploys as **two Vercel projects** plus two databases. This page covers a production deployment; for local development see [Getting Started](Getting-Started).

## What gets deployed

| Piece | Where | Notes |
| --- | --- | --- |
| Next.js app (`marketmitra-v2`) | Vercel, repo root | the dashboard, API routes and MCP server |
| Fundamentals service (`marketmitra-fundamentals-api`) | Vercel, `services/fundamentals-api/` | a Python function; trimmed dependency set in `requirements.txt` |
| User data | MongoDB Atlas | holdings, alerts, settings, retrieval chunks (needs Atlas Vector Search for retrieval) |
| Company and market data | PostgreSQL (Neon) | companies, ratios, news, IPOs, `screener_metrics` |
| Schedulers | GitHub Actions | see [Operations Runbook](Operations-Runbook) |
| Rate limiting (hosted) | Upstash Redis | optional; unset = no throttling |
| Auth (hosted) | Clerk | not needed to self-host |

## First-time setup

1. **Databases.** Create a MongoDB Atlas cluster and a Neon Postgres database.
2. **Two Vercel projects.** Create one from the repo root and one from `services/fundamentals-api/`. Link each directory with `vercel link`.
3. **Environment variables.** Set them on each project — see [Configuration](Configuration). In particular:
   - the shared secrets (`IPO_INGEST_TOKEN`, `SCREENER_INGEST_TOKEN`) must match on both projects;
   - on the app, `FUNDAMENTALS_API_URL` points at the data service's production URL;
   - on the data service, `DATABASE_URL` is the Neon connection string;
   - for a hosted instance, `NEXT_PUBLIC_DEPLOYMENT_MODE=hosted` plus the Clerk keys, `SETTINGS_ENC_KEY` and `ADMIN_USER_IDS`.
4. **Create the tables** (see *Migrations* below).
5. **GitHub secrets and variables** for the scheduled jobs — see [Configuration → GitHub Actions](Configuration#github-actions).
6. **Deploy** both projects, then **trigger the first data loads** (see [Operations Runbook](Operations-Runbook#first-data-load)).

## Releasing

Deploy order matters when a release changes the database:

1. **Run migrations first** (if there are new files under `services/fundamentals-api/migrations/versions/`).
2. **Deploy the data service.**
3. **Deploy the app.**
4. **Smoke test.**

```bash
# from services/fundamentals-api
vercel deploy --prod --yes

# from the repo root
vercel deploy --prod --yes

# verify
scripts/smoke-test.sh
```

Both projects deploy through the Vercel CLI. Merging to `main` does not by itself deploy.

### Migrations

Migrations are **additive and run out-of-band** — never from inside the deployed function. Apply them to production *before* deploying code that reads the new columns, or the new code will error against the old schema.

Use the *unpooled* Neon URL, injected for the one command so it never touches disk:

```bash
cd services/fundamentals-api
vercel env run -e production -- sh -c 'DATABASE_URL="$DATABASE_URL_UNPOOLED" .venv/bin/alembic upgrade head'
```

Check the current revision with `alembic current` using the same wrapper.

### Smoke test

`scripts/smoke-test.sh [app_url] [fundamentals_url]` checks the landing page, the stock aggregate API, the data service's `/health`, and that the operator-only routes reject anonymous callers. It exits non-zero on any failure. The **Post-deploy smoke test** workflow runs it on demand, and automatically after a Vercel deployment event when the repo is connected through the Vercel Git integration.

## Hosted-mode notes

- `NEXT_PUBLIC_DEPLOYMENT_MODE` must be `hosted` on the production project; **restart or redeploy** after changing it.
- Production currently runs on a **Clerk development instance**. That is a known, tracked limitation: a bare `curl` of `/` or any `/dashboard/*` sees a handshake redirect that only a real browser completes, and it does not behave like a custom-domain production instance.
- Set `ADMIN_USER_IDS`, or nobody can view the System page's event log.
- Vercel Functions have request and response body limits (4.5 MB) and a function duration cap — large downloads must be streamed or avoided.

## Self-hosting elsewhere

You can run the same code on a VPS or home server. Beyond the environment variables, **TLS is your responsibility** — put the app behind Caddy, nginx or similar with a renewed certificate. Self-host mode has no login by design: run it somewhere only you can reach, or put your own access control in front of it.
