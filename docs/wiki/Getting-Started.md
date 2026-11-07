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
| A populated screener | See [Screener Guide → How the data is kept fresh](Screener-Guide#how-the-data-is-kept-fresh) |

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
