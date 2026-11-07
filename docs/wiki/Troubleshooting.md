# Troubleshooting

Start with the symptom. For operator-level failures (scheduled jobs, deploys) see the [Operations Runbook](Operations-Runbook#failure-modes).

## Setup and running

**The app starts but pages are mostly empty.**
The data service isn't running or `FUNDAMENTALS_API_URL` is wrong. Start it (`uvicorn app.main:app --port 8420` in `services/fundamentals-api`) and check `curl localhost:8420/health`.

**`MongoServerSelectionError` / the dashboard errors out immediately.**
`MONGODB_URI` is missing or unreachable. The app fails fast (about 5 seconds) instead of hanging. For Atlas, allow your IP in Network Access.

**I changed `NEXT_PUBLIC_DEPLOYMENT_MODE` and the app misbehaves.**
That value isn't safe to hot-reload. Stop and restart `npm run dev`.

**Self-hosted: there's no login screen.**
By design — self-host is a single local user. If you want access control, put your own in front of it. See [Security](Security#scope-notes).

**`alembic upgrade head` fails on a duplicate revision, or the build fails on files named like `routes.d 2.ts`.**
Editors on macOS sometimes leave stray copies such as `name 2.ext`. They are gitignored; diff them against the original and delete them, then retry. It is not a real bug in the code.

**Port 3000 or 8420 is already in use.**
Another dev server is running. Find it with `lsof -iTCP:3000 -sTCP:LISTEN`.

## Mitra and AI

**Mitra says it "could not answer just now."**
Most often the saved AI key is invalid, out of quota, or the provider rejected the request. Open **Settings → AI provider key** and press **Test & save** with a fresh key. Operators can see the real cause in the event log under `api:ai/chat`.

**Mitra says I need to add a key.**
No key is saved for your account. Hosted mode has no shared fallback; self-host can use `AI_PROVIDER` / `AI_API_KEY`.

**Mitra is slow.**
A request that involves lookups, tuning and opening a page makes several model calls and can take 20–30 seconds. A faster model in Settings helps.

**Mitra won't give a buy recommendation or predict a price.**
Intended. See [Mitra Assistant](Mitra-Assistant#screening-with-mitra).

**Answers have no news or filing sources.**
Retrieval is disabled until `IPO_INGEST_TOKEN` is set on both services and the corpus has been indexed. Chat then falls back to a summary.

## Screener and search

**The sector or industry dropdown is nearly empty.**
Sector data only exists for companies whose fundamentals have been collected. The page's coverage line says how many that is; it fills as the incremental job runs. Operators: run the full backfill once ([Runbook](Operations-Runbook#first-data-load)).

**My growth or ROE screen returns fewer companies than I expect.**
Those filters only match companies with collected fundamentals. A company can be missing simply because it hasn't been reached yet.

**A figure shows "—".**
It isn't available yet (or the source had nothing). It does not mean zero.

**The numbers differ from Screener.in or my broker.**
Different sources, and sometimes consolidated versus standalone figures. Each record names its source tier.

**Search misses a company.**
The listing refreshes from NSE's files; a very new listing may not be in yet. Try the symbol or ISIN.

## Data and alerts

**Prices look stale.**
Free sources can lag or block. Check `/status`. The screener's prices refresh once each weekday after the market closes; live quotes on stock pages come straight from the source.

**IPO grey-market premium is missing.**
It comes from a scraped third-party site and shows "unavailable" when that source doesn't respond. It is never estimated.

**Alerts aren't firing.**
In-app alerts need the evaluation job to run (`evaluate-alerts`). Webhook delivery needs `ALERT_WEBHOOK_URL` (or your channel set up in Settings); email needs `RESEND_API_KEY`. The default Resend sender only reaches the Resend account owner.

## Getting help

- Search existing [issues](https://github.com/AnkushGitRepo/marketmitra/issues) and [discussions](https://github.com/AnkushGitRepo/marketmitra/discussions).
- Open a [bug report](https://github.com/AnkushGitRepo/marketmitra/issues/new/choose) with your mode (hosted or self-host), what you expected, what happened, and any event-log message.
- Security problems: **don't** file an issue — see [Security](Security#reporting-a-vulnerability).
