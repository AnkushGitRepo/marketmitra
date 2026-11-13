# Getting Started

This page gets MarketMitra running locally. For every variable, see [Configuration](Configuration); for production, see [Deployment](Deployment).

## What you're running

Two programs:

1. **The Next.js app** — the dashboard and its API routes. Needs MongoDB.
2. **The fundamentals service** (`services/fundamentals-api`) — a small Python/FastAPI service that serves company data, news, IPOs, the screener and embeddings. Needs PostgreSQL. See [Architecture](Architecture) for why it's separate.

The app runs without the data service, but most data pages will be empty — start both.

## Prerequisites

| Need | For |
| --- | --- |
| Node.js 20+ (the project targets 24) | the app |
| A MongoDB instance (a free Atlas M0 works) | user data: holdings, alerts, settings |
| Python 3.11+ and PostgreSQL | the data service |
| A [Clerk](https://clerk.com) application | **hosted mode only** — not needed to self-host |
| An AI provider key (Gemini, Anthropic or OpenRouter) | AI features — optional, bring your own |

## 1. Clone and install

```bash
git clone https://github.com/AnkushGitRepo/marketmitra.git
cd marketmitra
npm install
cp .env.local.example .env.local
```

## 2. Configure the app

Fill in `.env.local`. The minimum:

```
MONGODB_URI=<your connection string>
MONGODB_DB=marketmitra
FUNDAMENTALS_API_URL=http://localhost:8420
```

`NEXT_PUBLIC_DEPLOYMENT_MODE` defaults to `selfhost`: no login screen, you go straight to the dashboard as a single local user. `.env.local` is gitignored — never commit real credentials.

## 3. Start the data service

```bash
cd services/fundamentals-api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

createdb marketmitra_fundamentals        # or point DATABASE_URL at any Postgres
cp .env.example .env                     # defaults work against a local Postgres
alembic upgrade head                     # create the tables

uvicorn app.main:app --reload --port 8420
```

Check it: `curl localhost:8420/health`.

The company list (search and screener universe) fills itself on first use. It is loaded from NSE's published listing files, with copies bundled in the repo as a fallback if NSE blocks your network.

## 4. Start the app

```bash
cd ../..            # back to the repo root
npm run dev
```

Open <http://localhost:3000>. `/` is the landing page; `/dashboard` opens directly in self-host mode.

## 5. (Optional) Turn on more features

Everything below **degrades gracefully** — if it isn't configured the feature simply doesn't run, nothing errors.

| Feature | What to set |
| --- | --- |
| AI insights and Mitra chat | Add your provider key in **Settings** (stored encrypted; needs `SETTINGS_ENC_KEY`) |
| Retrieval-grounded answers | `IPO_INGEST_TOKEN` (same value in both services) |
| Alert evaluation | A scheduler hitting `/api/cron/evaluate-alerts` with `CRON_SECRET` |
| Email alerts | `RESEND_API_KEY`, `ALERT_EMAIL_TO` |
| A populated screener | [Fill the screener](#6-fill-the-screener) below |

## 6. Fill the screener

The company list fills itself (about 2,630 names). The screener table does not, so a fresh clone shows no stocks, or only a handful. Do not point the app at the hosted data service, and do not import a copy of that database. Run the same two jobs against your own Postgres.

Invent one throwaway string. It is not the production secret. Set it as `SCREENER_INGEST_TOKEN` in both `.env.local` and `services/fundamentals-api/.env` (the name is in `services/fundamentals-api/.env.example`), then restart both services. Both must be running.

**Quotes, about a minute.** This posts market cap, price, P/E, P/B and dividend yield for every listed company.

```bash
# CRON_SECRET empty in .env.local:
curl -X POST http://localhost:3000/api/cron/refresh-screener-quotes

# CRON_SECRET set:
curl -X POST http://localhost:3000/api/cron/refresh-screener-quotes \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Clear all** on `/screener` then lists every quoted company. The first screen stays “market cap at least ₹5,000 Cr” until 300 companies have fundamentals.

**Fundamentals, about 55 minutes.** From `services/fundamentals-api`, with the same token:

```bash
FUNDAMENTALS_API_URL=http://localhost:8420 \
SCREENER_INGEST_TOKEN=<the same throwaway value> \
.venv/bin/python scripts/refresh_screener_universe.py
```

That is the full scrape. When it finishes, the opening screen matches the hosted one: ROE at least 15% and debt/equity at most 1. Check progress any time:

```bash
curl localhost:8420/screener/stats
```

A stopped run is safe to repeat. Ingest updates rows in place, and a later incremental run continues from the companies still missing data:

```bash
FUNDAMENTALS_API_URL=http://localhost:8420 \
SCREENER_INGEST_TOKEN=<the same throwaway value> \
.venv/bin/python scripts/refresh_screener_universe.py --stale-first --limit 400
```

Repeat the quote command on weekdays, and the incremental command about once a day, if you want the table to stay current. What each field means is in the [Screener Guide](Screener-Guide).

## Everyday commands

```bash
npm run dev          # start the app
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests
npm run build        # production build
npm run format       # Prettier
```

`lint`, `typecheck`, `test` and `build` are exactly what [CI](Development-Guide#continuous-integration) runs on every push and pull request.

## Next steps

- Tour the app in [Features](Features).
- Connect an AI key and try [Mitra](Mitra-Assistant).
- Hit a snag? [Troubleshooting](Troubleshooting).
