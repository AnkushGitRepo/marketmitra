# Decision Records

Every real architectural or product decision in MarketMitra is written down as an **Architecture Decision Record (ADR)**: the context, what was decided, and the consequences. They are numbered, one per decision, and **never deleted** — a later ADR can supersede an earlier one, but the history stays.

The records live in [`docs/decisions/`](https://github.com/AnkushGitRepo/marketmitra/tree/main/docs/decisions). This page indexes them.

## When to write one

Write an ADR when a change affects the stack, data sources, security model, public API or a product boundary — anything a future contributor would otherwise have to rediscover or re-argue. A pull request description is not a record; it disappears from view. See the [Development Guide](Development-Guide).

## The non-negotiables, and where they come from

| Rule | Decided in |
| --- | --- |
| Next.js App Router with TypeScript | [0002](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0002-nextjs-app-router.md) |
| CSS Modules, no Tailwind or Bootstrap | [0003](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0003-css-modules-no-framework.md) |
| Backend is Next.js route handlers only (one scoped Python exception) | [0004](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0004-nextjs-api-routes-as-backend.md), [0011](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0011-three-tier-fundamentals-data-sourcing.md) |
| No paid tier, free data sources only | [0011](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0011-three-tier-fundamentals-data-sourcing.md), [0016](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0016-landing-page-no-paid-tier-reconciliation.md) |
| Hosted and self-hosted run the same code | [0008](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0008-hosted-vs-self-hosted-distribution.md), [0010](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0010-deployment-mode-gate.md) |
| AI is a neutral synthesis, never advice; no trade decisions | [0018](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0018-ai-insights-scope.md), [0021](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0021-phase-11-multi-agent-analysis.md) |
| Mitra's authority is bounded by which tools exist | [0022](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0022-mitra-navigation-and-file-import.md), [0030](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0030-intelligent-stop-loss-and-mitra-alert-tools.md) |
| Every feature ships a UI and a documented API together | [0019](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0019-phase-9-api-surface-mcp-rate-limiting.md) |

## Index

### Foundations

| # | Decision |
| --- | --- |
| 0001 | [Teardown and rebuild as MarketMitra v2](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0001-teardown-and-rebuild.md) |
| 0002 | [Next.js (App Router) + TypeScript as the application framework](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0002-nextjs-app-router.md) |
| 0003 | [CSS Modules + shared design tokens, no CSS framework](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0003-css-modules-no-framework.md) |
| 0004 | [Next.js API routes as the backend (no separate Express server)](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0004-nextjs-api-routes-as-backend.md) |
| 0005 | [Clerk for authentication](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0005-clerk-auth.md) |
| 0006 | [Vercel + MongoDB Atlas for deployment](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0006-vercel-mongodb-atlas-deployment.md) |
| 0007 | [Native MongoDB driver, not Mongoose](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0007-mongodb-native-driver.md) |
| 0008 | [Hosted vs. self-hosted distribution model](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0008-hosted-vs-self-hosted-distribution.md) |
| 0009 | [MIT license for the self-hosted codebase](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0009-mit-license.md) |
| 0010 | [Deployment mode gate (`DEPLOYMENT_MODE`)](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0010-deployment-mode-gate.md) |

### Data and services

| # | Decision |
| --- | --- |
| 0011 | [Fundamentals data sourcing — three-tier free fallback chain, Python service, no paid vendor](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0011-three-tier-fundamentals-data-sourcing.md) |
| 0013 | [Host fundamentals-api on Vercel (Python functions) + Neon Postgres, both within the existing Vercel account](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0013-fundamentals-api-vercel-hosting.md) |
| 0015 | [News feed — Phase 6 scope, sourcing, and architecture](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0015-news-feed-scope.md) |
| 0017 | [IPO tracker + GMP alerts — Phase 7 scope](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0017-ipo-tracker-gmp-scope.md) |
| 0024 | [Live-quote fix (yahoo-finance2 + NSE/BSE) and a stock aggregate endpoint](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0024-live-quote-yahoo-finance2-and-stock-aggregate-endpoint.md) |
| 0025 | [Screener — bulk-ingestion pipeline + shared filter schema](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0025-screener-bulk-ingestion-and-shared-filter-schema.md) |
| 0033 | [Screener hybrid refresh + ranked in-memory search](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0033-screener-hybrid-refresh-and-ranked-search.md) |

### Product features

| # | Decision |
| --- | --- |
| 0012 | [Portfolio holdings storage, real-data wiring for the dashboard UI, and dropped analytics widgets](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0012-portfolio-holdings-and-real-data-wiring.md) |
| 0014 | [Alerts engine — Phase 5 scope, delivery model, and evaluation architecture](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0014-alerts-engine-scope.md) |
| 0016 | [Reconcile the landing page with "no paid tier" (ADR 0011 vs ADR 0008)](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0016-landing-page-no-paid-tier-reconciliation.md) |
| 0026 | [Collapsible left sidebar replaces the top tab bar](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0026-collapsible-sidebar-navigation.md) |
| 0027 | [Shareholding pattern chart — 100% stacked bar over multi-line](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0027-shareholding-stacked-bar-chart.md) |
| 0028 | [Per-user Markets wishlists, and self-serve Slack/Telegram/WhatsApp/webhook alert channels](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0028-user-wishlists-and-notification-channels.md) |
| 0029 | [System status page + event log](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0029-system-status-and-event-log.md) |
| 0030 | [Intelligent stop-loss alerts + Mitra alert-management tools](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0030-intelligent-stop-loss-and-mitra-alert-tools.md) |
| 0031 | [Stock chart workspace — lightweight-charts, indicators, drawing tools](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0031-stock-chart-workspace-lightweight-charts.md) |

### AI, agents and the API

| # | Decision |
| --- | --- |
| 0018 | [AI Insights — Phase 8 scope, provider model, key handling, caching](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0018-ai-insights-scope.md) |
| 0019 | [Phase 9 — API surface formalization, MCP server, rate limiting](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0019-phase-9-api-surface-mcp-rate-limiting.md) |
| 0020 | [Phase 10 — AI chat + insights with retrieval (RAG)](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0020-phase-10-rag-chat.md) |
| 0021 | [Phase 11 — multi-agent analytical briefings (TradingAgents-pattern, in-house)](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0021-phase-11-multi-agent-analysis.md) |
| 0022 | [Mitra page-aware navigation + file-based portfolio import](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0022-mitra-navigation-and-file-import.md) |
| 0034 | [Mitra as a screening assistant](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0034-mitra-screener-assistant.md) |
| 0035 | [Mitra Advisor](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0035-mitra-advisor.md) |
| 0036 | [Full-page Mitra chat](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0036-mitra-chat-workspace.md) |
| 0037 | [App pages at /[page]](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0037-top-level-app-routes.md) |
| 0038 | [Settings page and preferences](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0038-settings-and-preferences.md) |

### Security, privacy and compliance

| # | Decision |
| --- | --- |
| 0023 | [Analytics + cookie-consent (production-readiness pass)](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0023-analytics-and-cookie-consent.md) |
| 0032 | [Security hardening pass](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/decisions/0032-security-hardening-pass.md) |

## Adding one

1. Copy the structure of an existing record: **Context → Decision → Consequences** (plus *Out of scope* where it helps).
2. Number it next in sequence: `docs/decisions/00NN-short-title.md`.
3. Link it from the architecture doc if it changes how the system works, and from the pull request.
4. If it supersedes an earlier record, say so in both — don't edit history away.
