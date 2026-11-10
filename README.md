# MarketMitra

A financial dashboard for Indian markets — one place to see your holdings, prices, and what
moved your money. Free, open-source, and self-hostable, with a hosted option for people who'd
rather not run their own infrastructure.

[![CI](https://github.com/AnkushGitRepo/marketmitra/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AnkushGitRepo/marketmitra/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/AnkushGitRepo/marketmitra)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](.github/CONTRIBUTING.md)

**[Live demo](https://marketmitra-v2.vercel.app)** · [Wiki](../../wiki) · [Documentation](#project-context-for-humans-and-agents) · [Contributing](.github/CONTRIBUTING.md) · [Report a bug](../../issues/new/choose)

---

## Contents

- [What it does](#what-it-does)
- [Status](#status)
- [Two ways to run it](#two-ways-to-run-it)
- [Stack](#stack)
- [Getting started](#getting-started)
- [The API surface, for AI agents too](#the-api-surface-for-ai-agents-too)
- [Project context, for humans and agents](#project-context-for-humans-and-agents)
- [Contributing](#contributing)
- [License](#license)

## What it does

- **Dashboard** — real Indian indices, watchlist movers, a portfolio you actually hold, and a
  full stock detail page (ratios, historical financials, shareholding, peer comparison,
  annual-report PDFs, price history).
- **Alerts** — price / %-move / 52-week / portfolio-P&L / IPO triggers, delivered in-app, by
  webhook, and by email.
- **News feed** — a free-RSS Indian-markets stream with a per-headline sentiment tag, sliceable
  by stock or by your own holdings.
- **IPO tracker** — calendar, subscription numbers, and grey-market premium (clearly labeled as
  an unofficial third-party estimate).
- **AI insights + Mitra chat** — bring your own key (Gemini, Anthropic, or OpenRouter),
  retrieval-grounded over a live corpus of news and filings, encrypted at rest. Always a
  neutral synthesis, never investment advice.
- **Multi-agent analysis** — four analyst agents research a stock from different angles, a
  bull and a bear debate it, and a synthesis briefing lays out both cases and where the
  evidence currently leans — without ever recommending a trade.
- **Research briefs** — a faster, structured report on a company, theme, portfolio, or
  comparison, grounded in the same retrieval corpus.
- **An API surface for agents, not just humans** — every feature above is also a documented,
  stable API endpoint, plus an MCP server for AI tool-use. See
  [`/docs/api-surface.md`](docs/api-surface.md).

No usage numbers, growth stats, or "battle-tested" claims appear anywhere in this repo. It's
a young rewrite — if a claim like that shows up somewhere, it's a bug, not a feature.

## Mitra Advisor (local-only, opt-in)

An optional, rules-based, long-term, quality-focused decision-support tool for your own money:
you write an Investment Policy once, and it produces a deterministic monthly plan — which is
often "no action this month". It is **off by default**, only runs when you set
`ADVISOR_MODE=enabled`, and is refused on a hosted deployment even if the variable is set.

> **Disclaimer.** Educational decision support, not investment advice. It does not guarantee
> or predict returns, and the stock sleeve may trail a plain index fund. It never places orders
> or touches a broker — every recommendation is a proposal you confirm and execute yourself.
> Scraped data can be wrong or stale. You are solely responsible for your decisions. You must
> accept this in-app the first time you use it.

Built: the flag and disclaimer, the policy (JSON import/export), the monthly plan, a quality screen, cited research memos, a decision journal with kill-criteria alerts, and paper-trading against a Nifty 50 fund with a plain warning if the stock picks trail it.
See [ADR 0035](docs/decisions/0035-mitra-advisor.md).

## Status

All planned phases are built. Phase-by-phase history, decisions, and what's still open live
in [`ROADMAP.md`](docs/ROADMAP.md), [`/docs/architecture.md`](docs/architecture.md), and
[`/docs/session-log.md`](docs/session-log.md) — this README won't try to keep up with that
level of detail, since it goes stale faster than code does.

This is **v2**: a full teardown-and-rebuild of the original MERN-stack Financial-Dashboard
project (React+Vite / Express / Django / a standalone Python scraper), consolidated into a
single Next.js + MongoDB Atlas stack built to serve a human dashboard and an AI agent from
day one. See [ADR 0001](docs/decisions/0001-teardown-and-rebuild.md) for why, and why nothing
carried over automatically — v1's code is still reachable in this repo's git history if an
old implementation detail is worth referencing.

## Two ways to run it

MarketMitra is **free and open-source with no paid tier, no billing, and no trial limits**
([ADR 0011](docs/decisions/0011-three-tier-fundamentals-data-sourcing.md),
[ADR 0016](docs/decisions/0016-landing-page-no-paid-tier-reconciliation.md)). Both run the
exact same codebase:

| | Hosted | Self-hosted |
| --- | --- | --- |
| **For** | People who'd rather not run infrastructure | Anyone who wants their own instance |
| **Sign-in** | Clerk | None — single local user, no login |
| **AI insights** | Bring your own key | Bring your own key |
| **Rate limits** | Fair-use limits on the shared instance | None |
| **License** | — | MIT |

A single `DEPLOYMENT_MODE` environment variable gates which one you get at runtime
([ADR 0010](docs/decisions/0010-deployment-mode-gate.md)) — see
[Getting started](#getting-started) below.

## Stack

| Layer     | Choice                                                           | Why                                                                 |
| --------- | ----------------------------------------------------------------- | -------------------------------------------------------------------- |
| Framework | Next.js (App Router, TypeScript)                                 | [ADR 0002](docs/decisions/0002-nextjs-app-router.md)                 |
| Styling   | CSS Modules + a shared design-token file, no Tailwind/Bootstrap  | [ADR 0003](docs/decisions/0003-css-modules-no-framework.md)          |
| Backend   | Next.js API route handlers (no separate server)                  | [ADR 0004](docs/decisions/0004-nextjs-api-routes-as-backend.md)      |
| Auth      | Clerk, active only in hosted mode                                 | [ADR 0005](docs/decisions/0005-clerk-auth.md), [ADR 0010](docs/decisions/0010-deployment-mode-gate.md) |
| Database  | MongoDB Atlas, native driver (no Mongoose)                        | [ADR 0007](docs/decisions/0007-mongodb-native-driver.md)             |
| Data service | `services/fundamentals-api/` — a scoped Python/FastAPI exception | [ADR 0011](docs/decisions/0011-three-tier-fundamentals-data-sourcing.md), [ADR 0013](docs/decisions/0013-fundamentals-api-vercel-hosting.md) |
| Hosting   | Vercel                                                            | [ADR 0006](docs/decisions/0006-vercel-mongodb-atlas-deployment.md)   |
| License   | MIT                                                               | [ADR 0009](docs/decisions/0009-mit-license.md)                       |

## Getting started

### Prerequisites

- Node.js 20+
- A [MongoDB Atlas](https://www.mongodb.com/atlas) cluster (or any MongoDB instance — a free
  M0 tier works)
- **Self-hosting (the default):** that's it. No Clerk account needed.
- **Running in hosted mode:** also requires a [Clerk](https://clerk.com) application — only
  relevant to MarketMitra's own deployment, not to self-hosting.

### Local setup

```bash
git clone https://github.com/AnkushGitRepo/marketmitra.git marketmitra
cd marketmitra
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` with your own values — at minimum:

```
MONGODB_URI=          # your MongoDB Atlas connection string
MONGODB_DB=marketmitra
```

`NEXT_PUBLIC_DEPLOYMENT_MODE` defaults to `selfhost` when left unset — the app runs with no
login screen, straight into the dashboard as a single local user. Self-hosted users don't
need to configure Clerk at all; those variables in `.env.local.example` only matter when
`NEXT_PUBLIC_DEPLOYMENT_MODE=hosted`. See [ADR 0010](docs/decisions/0010-deployment-mode-gate.md).

(`.env.local` is gitignored — never commit real credentials. `.env.local.example` documents
every variable with no values.)

```bash
npm run dev
```

The app runs at `http://localhost:3000`. `/` is the public landing page; `/dashboard` opens
directly in self-host mode (the default), or requires sign-in in hosted mode.

### Other scripts

```bash
npm run build       # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest unit tests
npm run format       # Prettier
```

These four (`lint`, `typecheck`, `test`, `build`) are exactly what [CI](.github/workflows/ci.yml)
runs on every push and pull request.

### Deploying

The project deploys to Vercel with MongoDB Atlas as the database — no other infrastructure
required. Set the same environment variables from `.env.local.example` in the Vercel project
settings. Vercel provisions and renews HTTPS automatically for the domain it assigns you.

If you self-host on your own infrastructure instead (a VPS, a home server, etc.) rather than
on Vercel, setting up HTTPS (a TLS certificate, e.g. via Let's Encrypt/Caddy/nginx, and
keeping it renewed) is your responsibility — it is not handled by this project.

### Alerts, retrieval/RAG, rate limiting, and the MCP server

These features need a bit more setup than the basics above (a cron scheduler, an embedding
service, an Upstash store). Full setup steps live in
[`/docs/api-surface.md`](docs/api-surface.md) and the relevant ADRs
([0014](docs/decisions/0014-alerts-engine-scope.md) for alerts,
[0019](docs/decisions/0019-phase-9-api-surface-mcp-rate-limiting.md) for the MCP server and
rate limiting, [0020](docs/decisions/0020-phase-10-rag-chat.md) for retrieval). Every one of
them **degrades gracefully** when its optional dependency isn't configured — nothing errors,
it just runs without that feature.

## The API surface, for AI agents too

Every feature in this app ships with a documented API endpoint alongside its UI — this
project is built to serve an AI agent as a first-class consumer, not as an afterthought.
Public market data (symbol search, quotes, fundamentals, price history, news, IPOs, indices)
is also exposed as an **MCP server** at `/api/mcp` for direct tool-use by AI agents, and
[`/llms.txt`](public/llms.txt) gives an agent-readable pointer into the rest.

See [`/docs/api-surface.md`](docs/api-surface.md) for the full endpoint reference.

## Project context, for humans and agents

This repo is built to be picked up cold by a fresh session — human or AI agent — without
re-deriving context from scratch:

- **[Wiki](../../wiki)** — the readable guide: getting started, features, the screener, Mitra,
  deployment, operations, security. Its source is [`docs/wiki/`](docs/wiki/) and it is
  published automatically from `main`.
- **[`AGENTS.md`](AGENTS.md)** — entry point for any coding agent (Cursor, Antigravity, Claude Code, …): rules, workflow, stack constraints, pointers to
  everything below.
- **[`/docs/architecture.md`](docs/architecture.md)** — current system architecture: routes,
  component structure, data flow.
- **[`/docs/design-system.md`](docs/design-system.md)** — colors, type scale, spacing,
  component patterns. Every page is built against this.
- **[`/docs/decisions/`](docs/decisions/)** — ADRs, one per real decision, numbered, never
  pruned.
- **[`/docs/data-sources.md`](docs/data-sources.md)** — every external API/scraper this
  project depends on: endpoint, auth, rate limits, cost, ToS notes.
- **[`/docs/api-surface.md`](docs/api-surface.md)** — the public API surface, documented for
  both the dashboard UI and AI agent consumers.
- **[`/docs/session-log.md`](docs/session-log.md)** — rolling log of what actually happened,
  session by session.

## Contributing

Contributions are welcome — bug fixes, features, new data sources, docs. Please read
[`CONTRIBUTING.md`](.github/CONTRIBUTING.md) first: it covers the project's non-negotiable
constraints (no paid tier, free data sources only, the stack choices above), how to set up
locally, and what's expected of a pull request. This project also follows a
[Code of Conduct](.github/CODE_OF_CONDUCT.md). Found a security issue? See [`SECURITY.md`](.github/SECURITY.md)
instead of opening a public issue.

## License

MIT — see [`LICENSE`](LICENSE) ([ADR 0009](docs/decisions/0009-mit-license.md)).
