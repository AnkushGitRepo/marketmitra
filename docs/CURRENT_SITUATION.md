# Current situation (TEMPORARY)

> **This file is temporary.** It was written at the end of the last Claude Code session (2026-11-11) so the next session, in
> Antigravity, starts from the real situation. **Do not delete it until the maintainer confirms.** When they do: delete this file and
> remove the "Current situation" pointer at the top of `docs/HANDOFF.md` and the matching line in "Open work". Anything lasting
> from this file belongs in `docs/HANDOFF.md`, an ADR (next number 0060) or `docs/session-log.md`.
>
> Read `AGENTS.md` and `docs/HANDOFF.md` first. This file is only about what is live right now.

## 1. In one paragraph

Everything built so far is merged and deployed (production runs commit `c16be7f`, package version 0.5.0; no open issues or PRs).
The one live problem is **hosting capacity**: the Vercel **Hobby** account has used **4h 28m of its 4h included Fluid Active CPU**
for the last 30 days, and it is still climbing. **About 90% of that CPU is the `marketmitra-fundamentals-api` project** (the
Python data service), almost all of it the 5-year price-history endpoint, not the Next app. Production works today, but the
account is over its free allowance. **Maintainer decision (2026-11-12): move the data service to Google Cloud (Cloud Run), using their
Google Cloud credit, which also frees the Vercel allowance for future projects.** The work is tracked in issue #169 and is blocked
on a few inputs from the maintainer (section 5, Option D).

## 2. What we measured (Vercel dashboard, read in the maintainer's Chrome on 2026-11-11)

- **Team Usage, last 30 days, Fluid Active CPU: 4h 28m / 4h.** By project: `marketmitra-fundamentals-api` **4h 01m (89.9%)**,
  `marketmitra-v2` **26m 47s (10.0%)**, every other project about 0.
- Shape over time: about 5 to 10 minutes a day until Nov 6, then spikes (about 28 min, 13 min, about 1h 10m on Nov 10, about 38 min
  on Nov 11). Those are the heavy build, test and deploy days plus real use of the hosted app. CDN requests rose the same way
  (about 500 to 1,000 a day, then 3.6K and 5.9K on Nov 10 and 11).
- Everything else is far from its limit: function invocations 39K to 40K of 1M, CDN requests 38K of 1M, provisioned memory about
  22 GB-hrs of 360, Fast Data Transfer 0.3 GB of 100.
- **Data service (`marketmitra-fundamentals-api`), last 12 hours:** 833 invocations, about 3 minutes of Active CPU, P75 509 ms per
  call, 25% cold starts, 0% errors, one function route (`/fastapi`). Its newest 400 log lines: **395 are
  `GET /companies/{symbol}/prices`**, 4 `GET /companies/{symbol}`, 1 `/indices`.
- **App (`marketmitra-v2`), last 12 hours:** 2.7K invocations, about 2 minutes of Active CPU. Top routes by invocations:
  `/api/notifications` 1.3K (the bell polling), then `/stock/[ticker]` 281, `/dashboard` 93, `/agents` 81. Page renders are cheap.
- Local development is **not** the source: `.env.local` has `FUNDAMENTALS_API_URL=http://localhost:8420`.
- **A correction to record:** earlier in the session the scheduled jobs (`agents-tick` every 5 min, `stock-analysts` every 20 min,
  `evaluate-alerts`, `index-corpus`) were suspected. The numbers say the app is only 10% of the CPU, so cutting those schedules would
  not fix this. (They are still a small, optional saving.)

## 3. Why the prices endpoint costs so much (from the code)

- `src/lib/dashboard/fundamentalsApi.ts` `getPrices()` uses `getJson(path, 900)`: the Next data cache keeps a price response for only
  **15 minutes**, for every period. Daily history changes once a day, so a 5-year series is refetched about 96 times a day per
  symbol when it is in use.
- Each (symbol, period) pair is its own cache key. With 13 holdings and the periods in use (`1mo`, `6mo`, `1y`, `5y`), a few
  page views an hour is enough for hundreds of data-service calls an hour.
- Callers (`grep "getPrices("`): the stock page (`5y`), `stockSignalsServer.ts` (`5y`, used by the 360 brief, the analysts' dossier
  and heartbeat, and the analyst chat), `portfolioHistory.ts` (`5y` per holding for the dashboard and portfolio, plus a per-period
  variant), the Markets page, alerts evaluation (`1mo`), agents, MCP tools and the advisor (`5y`).
- The data service already caches prices in its own database (`prices_cache_ttl_hours: 4` in `app/config.py`), but **every request
  still runs the Python function** (read, serialise about 1,250 rows). And it sends **no `Cache-Control`**, so Vercel's CDN never
  answers a repeat request for it.

## 4. What the risk is (and what is not confirmed)

- **Confirmed:** the dashboard shows "Exceeded free resources" with Fluid Active CPU in red; the site and both projects are up and
  healthy right now (errors 0%, timeouts under 0.1%).
- **Corrected (2026-11-12):** the maintainer says `validation-of-ip` and `clipsync` were **paused by them**, not by Vercel. So there
  is **no evidence yet** that Vercel enforces anything on this account. (An earlier version of this file treated them as a warning sign.)
- **Not confirmed:** what Vercel does to a Hobby project that stays over its allowance, and when usage resets (the dashboard window is
  rolling 30 days). The docs search available in the Claude Code session did not return the rule; the Vercel notification emails or
  the dashboard banner are the place to read it. The safe assumption is that it could eventually pause the project, which would take
  the hosted site down, so do not leave this unaddressed.
- Possible knock-on (unproven): the Safari "The string did not match the expected pattern." on the 360 brief (#162) could also have
  been a platform error page rather than a timeout. The timeout fix (300 s) is deployed but not yet confirmed in Safari.

## 5. What we can do, and how

Ordered by value for effort. The first two are small code changes and should cut the data service CPU by a large factor. Nothing
below has been started.

### Option A: cache price history much longer in the app (recommended, do first)

- **Where:** `src/lib/dashboard/fundamentalsApi.ts` `getPrices()`; `src/lib/dashboard/portfolioHistory.ts`.
- **How:** make the revalidate time depend on the period: `5y` and `1y` about 6 hours, `6mo` about 3 hours, `1mo` and shorter keep 15
  minutes. History before today never changes; the live price comes from `getQuotes` (`cache: 'no-store'`), so the page still shows a
  fresh price. Keep one 5-year fetch per symbol and slice it (`slicePricesByPeriod` already does this for the dashboard and portfolio);
  check that no caller fetches both `5y` and a shorter period for the same symbol (the per-period `getPortfolioValueHistory` is the
  one to look at).
- **Tests:** a pure `priceRevalidateSeconds(period)` function with unit tests (the Vitest suite is node-only and mocks the network).
- **Expected effect:** the 5-year and 1-year fetches fall roughly 24 times. Measure afterwards (section 6).

### Option B: let Vercel's CDN absorb repeat requests to the data service (recommended, do with A)

- **Where:** `services/fundamentals-api/app/main.py`, next to `security_headers_middleware` (an `@app.middleware("http")` that already
  sets response headers). Or per route in `app/api/routes/prices.py` and the other read routes.
- **How:** for successful GETs on the read-only company endpoints (`/companies/{symbol}/prices`, `/ratios`, `/shareholding`, `/peers`,
  `/financials/...`, `/documents`) add `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` (prices maybe `s-maxage=1800`).
  Do **not** cache `/quotes`, `/search`, `/indices`, health, ingest or anything with per-user data. A CDN hit does not run the Python
  function, which also removes most cold starts (25%).
- **Check first:** whether the Next app sends an auth or API-key header to the data service (CDN caching ignores it, so the response
  must be public data, which company data is) and that the rate limiter in `app/rate_limit.py` does not break (CDN hits skip it).
  Add a pytest for the header on the right routes and none on the others.
- **Deploy:** this is a data-service change, so it needs `cd services/fundamentals-api && vercel deploy --prod --yes` (the Next app
  deploy does not include it), with the maintainer's go-ahead.

### Option C: smaller trims (optional)

- `/api/notifications` polling (1.3K calls per 12 hours): poll less often and pause when the tab is hidden. Small saving (the app is
  10% of CPU) but cheap.
- Schedules: `stock-analysts` every 20 minutes could be hourly, `agents-tick` every 15 minutes, with early returns. Small saving.

### Option D: move the data service to Google Cloud Run (CHOSEN by the maintainer, 2026-11-12; issue #169)

- **Why it fits:** the data service is a standalone FastAPI app and 90% of the CPU. Cloud Run runs a container, bills CPU only while
  requests run, and has a free tier (check the current numbers at cloud.google.com/run/pricing; as of this writing about 2M requests
  and 180,000 vCPU-seconds a month, around 50 hours, against Vercel Hobby's 4 hours of Active CPU). The Google Cloud credit (about
  ₹25,000) covers anything beyond. Moving it takes about 90% of this account's Vercel CPU, so the allowance is free for future
  projects; `marketmitra-v2` alone uses about 0.5 h a month.
- **Inputs needed from the maintainer (the work is blocked on these):**
  1. A Google Cloud **project with billing** and the credit attached, and a **budget alert** (for example at ₹500 and ₹2,000). Which
     credit it is (a free trial is usually about $300 and expires after 90 days) and its expiry date. After it expires, usage inside
     the free tier is still free and anything above is billed to the card.
  2. The **Neon database region** (Neon console). It decides the Cloud Run region: the service talks to the database on almost every
     request, so keep them in the same region. Also decide the Vercel app's function region: it has none set, so it runs in the
     default US East. Every page view makes several calls to the data service, so a cross-ocean hop adds roughly 150 to 250 ms per
     call. Either choose the Cloud Run region near the app or set `regions` on the `marketmitra-v2` Vercel project to match Neon and
     Cloud Run (a Hobby project can pick one region).
  3. The explicit go-ahead for each production step (create the service, switch `FUNDAMENTALS_API_URL`, redeploy the app). A deploy
     does not mean a new version.
- **Plan (small PRs, issue first; ADR 0060 supersedes the hosting parts of 0011 and 0013):**
  1. **Container.** Add `services/fundamentals-api/Dockerfile` (python:3.12-slim, install `requirements.txt`, `CMD uvicorn
     app.main:app --host 0.0.0.0 --port $PORT`), a `.dockerignore`, and **bake the `fastembed` model into the image** (the
     requirements note says it downloads about 64 MB to `/tmp` on first use, about 18 s on a cold start). Check `app/config.py` for
     the cache directory setting. Run it locally with Docker and hit `/health` and a prices call.
  2. **Deploy to Cloud Run** in the agreed region: `gcloud run deploy marketmitra-fundamentals --source services/fundamentals-api
     --region <region> --allow-unauthenticated --min-instances 0 --memory 2Gi --cpu 1`, with the environment variables from
     `.env.example` (`DATABASE_URL`, `IPO_INGEST_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `RATE_LIMIT_PER_MINUTE`,
     `NSE_REQUESTS_PER_SECOND`, `LOG_LEVEL`, and `SCREENER_INGEST_TOKEN` if the service reads it). **Values go in Secret Manager or
     the service's env, never in the repo or in chat.** It stays public like today; the app-level rate limit (Upstash) still applies.
     Prefer a CI deploy with **Workload Identity Federation** over a long-lived JSON key.
  3. **Parity check** before cutover, against the Vercel deployment: `/health`, `/companies/{symbol}`, `/companies/{symbol}/prices?period=5y`,
     `/ratios`, `/shareholding`, `/peers`, `/financials/...`, `/screener/...`, `/indices`, for a few symbols (shape and values).
  4. **Cutover (each step needs the go-ahead):** set `FUNDAMENTALS_API_URL` to the Cloud Run URL in the `marketmitra-v2` Vercel
     production environment and in the GitHub **repo variable** `FUNDAMENTALS_API_URL` (used by `refresh-ipos`, `refresh-screener`,
     `refresh-screener-quotes`; those workflows fall back to the old Vercel URL when the variable is unset), then redeploy the app
     with `npm run deploy:prod`. Database migrations are unchanged (the maintainer still runs Alembic against Neon).
  5. **Run both, then retire the old one (the maintainer's idea, 2026-11-12):** deploy the Cloud Run service first and test it
     without sending it real traffic; link the app to it only after the parity check; then watch for 24 hours and 7 days (Cloud Run
     request latency, cold starts and errors; the app's pages; Vercel Usage by project, where the data service should drop to
     about 0). **Keep the Vercel data service deployed but idle rather than paused:** an idle Vercel deployment uses no CPU (Active
     CPU is only billed while a request runs), and it can take traffic again in one step, whereas a paused project has to be
     un-paused first. Rollback is: set `FUNDAMENTALS_API_URL` back to the Vercel URL in the `marketmitra-v2` production environment
     and the GitHub repo variable, then redeploy the app. Both services use the same Neon database and the same Upstash rate-limit
     store, so the data is identical; the only drift is code, so after the cutover **do not change the data service code on Vercel**
     (the old copy is frozen as the backup) and make sure only one place triggers the ingestion workflows (they follow the repo
     variable). After about a week of clean running, delete or pause the Vercel project. Optional, small and not part of the first
     pass: an automatic fallback in `getJson` (`src/lib/dashboard/fundamentalsApi.ts`) that retries a failed call once against a
     `FUNDAMENTALS_API_FALLBACK_URL`, so a Cloud Run outage fails over by itself; it would also make the Vercel copy used (and
     billed in CPU) only during an outage.
  6. **Docs:** ADR 0060, `AGENTS.md` (the stack bullet that scopes the Python exception and cites 0013), `docs/HANDOFF.md` (the
     deploying section and gotchas), `docs/architecture.md`, `docs/data-sources.md` if hosts are listed.
- **Trade-offs to accept knowingly:** a second place to operate (logs and metrics move to Google Cloud Logging and Monitoring, no
  Vercel dashboard for it), cold starts after idle time (min instances 0; setting 1 removes them but is billed even when idle), the
  cross-region latency above, and the credit expiring. Docker keeps lock-in low: the same container runs anywhere.
- **Still worth doing alongside (Option A):** longer price caching in the Next app. It cuts the number of calls to the new service
  and speeds pages up, whatever hosts it. Option B (CDN `Cache-Control`) is Vercel-specific and is not needed once the service
  has moved.

### Option E: pay or self-host

- Vercel Pro removes the Hobby limits but is a cost decision for the maintainer. Self-hosting is unaffected (it has no Vercel limits).

### Recommended order (updated 2026-11-12)

1. Maintainer provides the inputs for Option D (Google Cloud project and credit, budget alert, Neon region). 2. Container and local
parity (no production impact). 3. Deploy to Cloud Run and run the parity check. 4. Cutover with the go-ahead, then watch for 24
hours. 5. Option A in parallel (small, independent). 6. After a week, retire the Vercel data service and record the re-measured
numbers in the handoff. Option B is skipped if the move goes ahead; C only if wanted.

## 6. How to measure (no billing data is available through the CLI on Hobby)

- **Dashboard:** `https://vercel.com/ankushgupta/~/usage`, scroll to **Fluid Active CPU** (sidebar link; the sections load lazily, so
  scroll slowly), tab **Projects**. Per project and route: `https://vercel.com/ankushgupta/<project>/observability/vercel-functions`
  (`marketmitra-v2` or `marketmitra-fundamentals-api`).
- **CLI:** `npx vercel logs --environment production --since 55m --limit 400 --json` from the project folder (Hobby keeps about 1 hour
  of runtime logs). Count paths to see what is called. `vercel billing usage` does not work on Hobby.
- A good result: the data service's Active CPU per day falls well below the 4h-a-month pace (about 8 minutes a day) and `/prices`
  stops dominating its logs.

## 7. What is not verified (be honest about it)

- Vercel's enforcement behaviour and reset timing (section 4).
- The hosted site as a signed-in user: the Analyst Desk, chat, morning brief, criteria, the redesigned stock page.
- A real brief generation on the hosted site in Safari after the 300 s change (#162/#163). Open risk: Safari may drop a request that is
  silent for about 60 s even when the server allows 300 s. If it still fails: keep the response alive with periodic whitespace, or
  generate asynchronously and poll.
- The first scheduled `stock-analysts` run (the workflow had not run once when last checked; GitHub can take a while to start a new
  schedule, or trigger it with "Run workflow") and the first `analyst-dispatch` run at 08:30 IST, plus a real morning-brief email
  (Send test was never pressed) and a real thesis-breach alert.
- Recovery from a real cold-start Mongo failure (the fix, #158/#159, is deployed; it needs one to happen to be proven).
- Anthropic and OpenRouter keys for any of the AI features (only `gemini-3.8-flash` was exercised), and unrestricted mode in chat.
- Atlas reachability: the earlier `MongoServerSelectionError`s were a transient blip; if they recur, check the cluster and its network
  access list (Vercel's IPs change, so it usually has to allow all addresses).

## 8. Decisions waiting for the maintainer

1. **Decided (2026-11-12):** move the data service to Google Cloud Run (Option D, issue #169). The two paused projects were paused by
   the maintainer, not Vercel.
2. **Still needed for Option D:** the Google Cloud project, billing and credit details with a budget alert; the Neon region; the
   Vercel app region choice; the go-ahead for each production step.
3. Whether to do Option A (longer price caching) in parallel (recommended).
4. Confirm this file can be deleted once the move is done or the next session has absorbed it (then delete it and the HANDOFF pointer).

## 9. Rules the next agent must follow (short list; full text in `AGENTS.md`)

- Issue first, one branch per issue, Conventional Commits, PR from the template, squash-merge when the 5 required checks are green and
  review threads are resolved (the code-scanning bot comments on every push).
- **Never deploy to production without the maintainer's explicit go-ahead. A deploy does NOT mean a new version** (ADR 0059): deploy
  `main` as it is with `npm run deploy:prod` and verify by commit; cut a release only when asked. Small fixes are not a version.
- The local environment shares the production MongoDB (a real hosted user's data lives there). A non-hosted run only touches the user
  `local`; ask before deleting anything else.
- iCloud keeps creating gitignored ` 2`-style duplicate files under `src`, `public` and `.next` (they break `tsc` and make
  `deploy:prod` refuse): delete the untracked ones before checks and before deploying.
- Report faithfully: say what was and was not verified. Do not invent metrics in copy.
- The maintainer prefers: plain answers, diagnosis from evidence (logs, dashboards) rather than assumption, and being told when a
  suggested theory does not match the evidence.
