# Architecture

Current system architecture for MarketMitra v2. Kept in sync with reality — when a feature
ships and is signed off, its detailed build notes move to `/docs/archive/<feature-name>.md`
and only a short summary stays here (see the context maintenance protocol in `/CLAUDE.md`).

## Status: Phases 0–11 signed off and live in production

v2 is a teardown-and-rebuild of the v1 Financial-Dashboard repo ([ADR 0001](./decisions/0001-teardown-and-rebuild.md)).
Every feature phase through **Phase 11 (multi-agent analysis)** is built, deployed to
production, and signed off. `v2` is kept identical to `main` so the GitHub Actions cron
schedulers can fire from the default branch. A Mitra navigation + file-import build
(ADR 0022) is also live — merged, deployed, and awaiting review before its own
archiving pass (see below). A Screener build (ADR 0025), the live-quote fix (ADR 0024),
new index detail pages, and a production-readiness pass (ADR 0023) are also merged,
pushed, and **deployed to production 2026-09-13** — the prod Neon migration for
`screener_metrics` is applied, but the daily bulk-ingestion cron is not yet activated
(only a `--limit 5` local test run has happened; the full ~2,570-company universe run
still needs to happen and be reviewed first).

- **Phase 2–3:** scaffold + deployment-mode gate, landing page, on-brand auth pages,
  dashboard shell. ([archive: landing-page, auth-pages, dashboard-shell](./archive/))
- **Phase 4:** fundamentals data service (`services/fundamentals-api/`) + the real-data
  dashboard (`/dashboard`, `/portfolio`, `/markets`, `/stock/[ticker]`). ([archive](./archive/fundamentals-data-service.md))
- **Phase 5:** alerts engine (`/dashboard/alerts`) + generic notification subsystem. ([archive](./archive/alerts-engine.md))
- **Phase 6:** news feed (`/dashboard/news`). ([archive](./archive/news-feed.md))
- **Phase 7:** IPO tracker + GMP (`/dashboard/ipos`). ([archive](./archive/ipo-tracker.md))
- **Phase 8:** AI insights + Mitra chat (`/dashboard/settings` + insight cards + chat). ([archive](./archive/ai-insights.md))
- **Phase 9:** API surface — MCP server (`/api/mcp`), fair-use rate limiting, interactive explorer (`/dashboard/api`). ([archive](./archive/api-surface.md))
- **Phase 10a:** retrieval (RAG) under chat + insights — `chunks` collection + Atlas Vector Search, embeddings on the fundamentals-api (`/embed`), `/api/cron/index-corpus`, agentic chat, grounded insights, per-user notes/holdings/chat layer. ([archive](./archive/rag-chat.md))
- **Phase 10b:** `/dashboard/research` — a structured, ephemeral brief (company / theme / portfolio / comparison), retrieval + synthesis only, no agentic loop. ([archive](./archive/rag-chat.md#phase-10b--the-research-surface))
- **Phase 11:** multi-agent analytical briefings (`/dashboard/agents`) — four analyst agents → bull/bear debate → synthesis, async checkpointed runs, a reflection loop. Deployed. ([archive](./archive/multi-agent-analysis.md))

The repo is a small monorepo: the Next.js app at the root (`src/`) plus a standalone Python
service under `services/fundamentals-api/`.

**Open follow-ups** (tracked in ROADMAP.md, none a blocker): one real alert fire + one real
IPO-alert fire in market hours; pre-bundle the embedding model; filings-in-corpus needs an
un-blocked PDF host.

## Stack

- **Framework:** Next.js 16, App Router, TypeScript, `src/` directory ([ADR 0002](./decisions/0002-nextjs-app-router.md))
- **Styling:** CSS Modules + `src/styles/tokens.css` design tokens, no CSS framework ([ADR 0003](./decisions/0003-css-modules-no-framework.md))
- **Backend:** Next.js API route handlers under `src/app/api/**/route.ts` ([ADR 0004](./decisions/0004-nextjs-api-routes-as-backend.md)); one scoped exception — the Python `services/fundamentals-api/` ([ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md))
- **Auth:** Clerk v7 ([ADR 0005](./decisions/0005-clerk-auth.md))
- **Database:** MongoDB Atlas via native driver, cached connection helper at `src/lib/mongodb.ts` with a 5 s `serverSelectionTimeoutMS` so an unreachable cluster fails fast ([ADR 0007](./decisions/0007-mongodb-native-driver.md)). `services/fundamentals-api/` uses Postgres (Neon) — a per-service exception ([ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md))
- **Hosting:** Vercel — both projects deploy via the Vercel CLI (`vercel deploy --prod --yes`) ([ADR 0006](./decisions/0006-vercel-mongodb-atlas-deployment.md), [ADR 0013](./decisions/0013-fundamentals-api-vercel-hosting.md))
- **License:** MIT ([ADR 0009](./decisions/0009-mit-license.md))
- **Deployment mode:** `NEXT_PUBLIC_DEPLOYMENT_MODE` (`hosted` | `selfhost`, defaults to `selfhost`) gates Clerk auth and the marketing-only landing sections. **Not** a billing switch — MarketMitra has no paid tier ([ADR 0010](./decisions/0010-deployment-mode-gate.md), [ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md), [ADR 0016](./decisions/0016-landing-page-no-paid-tier-reconciliation.md))

> **Note (Next.js 16 / Clerk v7):** the middleware file convention is renamed to `proxy.ts`
> (`src/proxy.ts` here) — same API, new filename. Clerk v7 ("Core 3") removed
> `<SignedIn>`/`<SignedOut>`/`<Protect>` in favor of `<Show when="signed-in" | "signed-out">`.
> Both surprised the scaffold build — noted so a future session doesn't relitigate them from
> stale training data.

## Route structure

| Route                        | Purpose                                                       | Auth (hosted)                         | Selfhost behavior                          |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------- | ----------------------------------------- |
| `/`                          | Landing page — full marketing content                        | public                                | public; pricing/FAQ sections not rendered |
| `/sign-in/[[...sign-in]]`    | Clerk hosted sign-in, on-brand split layout                  | public                                | redirects to `/dashboard`                  |
| `/sign-up/[[...sign-up]]`    | Clerk hosted sign-up, on-brand split layout                  | public                                | redirects to `/dashboard`                  |
| `/dashboard`                 | Dashboard home — stats, portfolio chart, indices, movers, open IPOs | protected in `src/proxy.ts`    | open directly, no login                    |
| `/dashboard/portfolio`       | Holdings, allocation, concentration, per-holding P&L, AI insight | protected                          | open directly                              |
| `/dashboard/markets`         | Index quotes, watchlist gainers/losers, search               | protected                              | open directly                              |
| `/dashboard/stock/[ticker]`  | Stock detail — price chart, ratios, financials, shareholding, peers, About, docs, news, AI read | protected     | open directly                              |
| `/dashboard/index/[name]`    | Index detail (NIFTY 50/SENSEX/NIFTY BANK/INDIA VIX) — live quote, 52w hi/lo, price chart, general market news. Reached by clicking an index card or searching one — deliberately **not** in the nav (only 4 indices exist; discovery is via search/cards) | protected | open directly |
| `/dashboard/alerts`          | Price / %-move / 52w / portfolio-P&L alerts + IPO alerts     | protected                              | open directly                              |
| `/dashboard/news`            | News feed — global stream + "My holdings" toggle             | protected                              | open directly                              |
| `/dashboard/ipos`            | IPO tracker — calendar, subscription, GMP, per-IPO alerts    | protected                              | open directly                              |
| `/dashboard/settings`        | BYO AI provider key (encrypted at rest)                      | protected                              | open directly                              |

All `/dashboard*` routes share one layout (`src/app/dashboard/layout.tsx` → `AppShell`).

`src/proxy.ts` runs `clerkMiddleware`, protects `/dashboard(.*)`, and redirects
unauthenticated visitors to `/sign-in?redirect_url=...` — **only when `isHosted()`**. In
selfhost mode it passes every request through untouched. Verified end-to-end in production
(hosted) and locally in both modes.

**Full design system reference: [`/docs/design-system.md`](./design-system.md)** — build
every new page against that doc, not against whichever page was built most recently. The
dashboard surface uses an app-specific `--app-*` token subset in `src/styles/tokens.css`,
distinct from the marketing landing page's `--color-mint*` tokens; fonts stay shared.

**Clerk branding note (open item):** hiding "Secured by Clerk" via `elements.footer` is a
supported appearance option, not a documented guarantee for every plan tier. Production
still runs on a Clerk **dev instance** (`touched-perch-1357.clerk.accounts.dev`) —
pre-existing and tracked; a consequence is that bare `curl` of any `/dashboard/*` or `/`
sees a dev-instance handshake/rewrite that only a real browser completes.

## Deployment mode gate (`isHosted()`)

Full detail: [ADR 0010](./decisions/0010-deployment-mode-gate.md). Load-bearing pattern
every new feature must respect. Where the gate is checked:

- **`src/lib/deployment-mode.ts`** — the one `isHosted()` helper; reads
  `NEXT_PUBLIC_DEPLOYMENT_MODE`, works in server and client code.
- **`src/proxy.ts`** — whether `clerkMiddleware` route protection runs at all.
- **`src/app/layout.tsx`** — whether `<ClerkProvider>` is mounted.
- **`src/app/sign-in/.../page.tsx`, `sign-up/.../page.tsx`** — redirect to `/dashboard`
  instead of rendering Clerk widgets when not hosted (rendering them with no `ClerkProvider`
  throws).
- **`src/components/appshell/HostedUserBadge.tsx`** — Clerk's `<UserButton>` mounts only in
  hosted mode; selfhost shows a static "Local user" badge. (The Phase 3 landing/sidebar
  equivalents — `Navbar.tsx`, `HostedUserFooter.tsx` — follow the same pattern.)
- **`src/app/page.tsx` + `Footer.tsx`** — `PricingCards` / `FAQAccordion` and their nav
  anchors are *absent* from the selfhost response, not CSS-hidden.
- **Feature backends** (alerts, news, IPO, AI) are **not** gated on `isHosted()` — they gate
  on their own config env vars. Self-host stays fully featured. The one AI nuance: per-user
  AI surfaces use the deployment `AI_*` env key only when `!isHosted()` (single local user);
  hosted per-user surfaces never fall back to an operator key.

**Production requirement:** `marketmitra-v2.vercel.app` has `NEXT_PUBLIC_DEPLOYMENT_MODE=hosted`
set — confirmed by the user 2026-09-04.

**Dev-mode gotcha:** changing `DEPLOYMENT_MODE` in `.env.local` while `npm run dev` is
running is not safely hot-reloadable (Fast Refresh can hot-swap a client component into the
tree before the root layout re-renders `<ClerkProvider>`, briefly calling `useUser()` with
no provider). Fully restart `npm run dev` after changing it.

## Dashboard app shell (`/dashboard*`)

Visual design imported from an approved Claude Design project ("MarketMitra App", 2026-09-05),
implemented natively with fonts swapped to Manrope / JetBrains Mono.

- **Shell:** `src/components/appshell/AppShell.tsx` wraps every `/dashboard*` route with
  `Sidebar` (collapsible left nav, see below), `AppHeader` (slim top bar spanning the content
  column: search, notification bell, settings gear, ₹-mask toggle, user badge — mobile keeps
  its own compact header with brand mark), `AiWidget` (floating "Mitra" assistant), and
  `MobileTabBar`. Real Next.js routes per page — not the design's client-state single-page
  switcher — so back/bookmarks work.
- **Sidebar navigation** ([ADR 0026](./decisions/0026-collapsible-sidebar-navigation.md)) —
  `Sidebar.tsx` holds all 11 nav items (icon + label, shared `NAV_ITEMS`/`isNavActive` from
  `navItems.ts`, icons from `NavIcons.tsx`), replacing the old top-bar tab row once it ran out
  of horizontal room. Expanded (240px) / collapsed (76px, icon-only) toggled by a chevron,
  persisted to `localStorage` via `useSyncExternalStore` (avoids a hydration-mismatch flash —
  same pattern as `CookieNotice.tsx`). Active route gets the same dark-pill treatment the old
  top nav used. Hidden below 760px, where `MobileTabBar`'s existing 5-item bottom bar
  (Dashboard/Portfolio/Markets/Alerts/News) continues to serve navigation, unchanged — the
  sidebar is tablet/desktop-only by design.
- **Shared pieces:** `src/components/dashboard-charts/` (`LineChart`, `PillTabs`, `IndexCard`,
  `MoverPanel`, `CompanyLogo`, `NewsList`, `InsightCard`, `IpoOpenCard`) and
  `src/lib/dashboard/` (`fundamentalsApi.ts`, `newsApi.ts`, `iposApi.ts`, `transforms.ts`,
  `quotes.ts`, `portfolioHistory.ts`, `enrichedHoldings.ts`, `watchlist.ts`, `chartMath.ts`,
  `format.ts`, `MaskContext.tsx`). The "Mitra" widget (`src/components/appshell/AiWidget.tsx`)
  is a real streamed chat against `/api/ai/chat` (ADR 0018) with section-aware starter prompts —
  no scripted content.
- **Real data, end to end** ([ADR 0012](./decisions/0012-portfolio-holdings-and-real-data-wiring.md))
  — no mock data anywhere in this surface. Stock detail, markets/indices, portfolio holdings
  (a genuinely new feature — `holdings` collection + `/api/holdings` CRUD), NSE-universe
  search, company logos, news cards, and AI insight cards are all live. Build detail,
  gotchas, and what was *dropped rather than faked*: [archive/fundamentals-data-service.md](./archive/fundamentals-data-service.md).
- The landing page's `DashboardPreview` is still static mock data — marketing content, not
  the logged-in app.

## Fundamentals data service (`services/fundamentals-api/`)

Full detail: [archive/fundamentals-data-service.md](./archive/fundamentals-data-service.md);
decisions in [ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md) /
[ADR 0013](./decisions/0013-fundamentals-api-vercel-hosting.md); run/test instructions +
plain-language coverage table in [`services/fundamentals-api/README.md`](../services/fundamentals-api/README.md).

- **Stack:** FastAPI (async), PostgreSQL via SQLAlchemy async + asyncpg (Alembic), pydantic
  v2, polars, httpx, orjson. Postgres not MongoDB — tabular data, a deliberate per-service
  exception.
- **Three-tier free-data fallback chain**, tried per-field: Tier 1 `nsepython`/`bsedata` +
  XBRL/PDF parsing → Tier 2 `yfinance` → Tier 3 Scrapling against Screener.in (isolated
  module). Every record carries `source_tier`. **NSE blocks non-browser/non-Indian traffic
  at the Akamai edge** — confirmed in dev; this is *why* Tiers 2–3 are real fallbacks.
- **Endpoints:** company / ratios / shareholding / financials / prices / documents / peers /
  `GET /indices` / `GET /search?q=` (~2,570 NSE equities) / `GET /quote?symbols=` (batched
  live quote) / `GET /news` / `GET /ipos` + `POST /ipos/ingest`. All in
  [`/docs/api-surface.md`](./api-surface.md).
- **Hosted in production:** Vercel Python serverless function + Neon Postgres. Live at
  `https://marketmitra-fundamentals-api.vercel.app`; the deployed function uses a trimmed
  `requirements.txt` and avoids `scrapling.fetchers.Fetcher` (pulls a ~130 MB Playwright
  driver it never uses).
- **Financial statements — Tier 1 + Tier 3** (2026-09-06): `app/ingestion/filing_discovery.py`
  finds the most recent NSE/BSE results filing (NSE `/api/corporates-financial-results`
  primary, BSE `AnnGetData` fallback), and `xbrl_parser` / `pdf_financials` extract it as the
  latest period; the Screener scrape fills the history and serves as the fallback when
  discovery comes up empty. The NSE fetch is unverified from a blocked environment (ADR 0011)
  — parsers are fixture-tested and every failure collapses to "Tier 1 had nothing", so no
  regression. `financials_tier1_enabled` config flag turns it off.

## Alerts engine (`/dashboard/alerts`)

Full detail: [archive/alerts-engine.md](./archive/alerts-engine.md); rationale in
[ADR 0014](./decisions/0014-alerts-engine-scope.md).

Four trigger types (price threshold, percent move, 52-week breach, portfolio P&L), evaluated
on a schedule, delivered through a **generic notification subsystem** (`src/lib/notifications/`)
— in-app always, email + webhook when configured, `resolveChannels()` gated on config env
vars not `isHosted()`. `alerts` + `notifications` MongoDB collections. Pure evaluators +
`decideAlertTransition` (one-shot vs re-arm, cooldown, hysteresis) in `src/lib/alerts/`,
unit-tested with no I/O. The cycle (`evaluate.ts`) batches one `GET /quote`, degrades
gracefully on missing data (`skippedNoData`, never fires). `GET|POST /api/cron/evaluate-alerts`
is `CRON_SECRET`-guarded; `vercel.json` declares a once-daily cron (Hobby ceiling), real
~10-min cadence needs an external scheduler. UI: `/dashboard/alerts` + a `NotificationBell`
in `AppHeader`. The IPO tracker (Phase 7) reuses this engine — see below. **Email transport
is a config-gated no-throw stub** pending Resend provisioning.

## News feed (`/dashboard/news`)

Full detail: [archive/news-feed.md](./archive/news-feed.md); rationale in
[ADR 0015](./decisions/0015-news-feed-scope.md).

Free RSS only, ingested in `fundamentals-api` with **lazy TTL refresh-on-read** (no cron).
Global stream = 4 broad Indian-markets RSS feeds; stock/portfolio views = Google News RSS
per company name (exact symbol tag). Postgres `news_items` (URL-deduped) + `news_item_symbols`
(migration `31f04c1b3507`), 30-day retention, keyset cursor pagination. Each item carries a
VADER **headline-tone** label — shown everywhere as tone, *not a signal*. `GET /news` +
`GET /api/news` (thin proxy). Surfaces: `/dashboard/news` (with an "All markets / My
holdings" toggle) and a "Recent news" card on the stock page, both via a shared `NewsList`.
No `isHosted()` gating. No news notifications in v1 (the subsystem is ready for them).

## IPO tracker + GMP (`/dashboard/ipos`)

Full detail: [archive/ipo-tracker.md](./archive/ipo-tracker.md); rationale in
[ADR 0017](./decisions/0017-ipo-tracker-gmp-scope.md).

IPO calendar + subscription + **grey-market premium** (scraped from InvestorGain's "Live IPO
GMP" report, heavily caveated as an unofficial estimate, degrades to "unavailable"; ToS
accepted on the same terms as the Screener scraper). Postgres `ipos` table (migration
`2796fbd6805c`), lazy TTL refresh, update-first upsert on slug, 10-day post-listing prune.
**Fetch is out of band** — the report is a client-rendered SPA, so
`scripts/refresh_ipos.py` renders it with Playwright Chromium and `POST`s to `/ipos/ingest`
(`IPO_INGEST_TOKEN` bearer); the serverless `GET /ipos` only reads Postgres. Alerts **reuse
Phase 5's engine** — `ipo_watch` (one per user) + per-IPO `ipo` variants in the same
`alerts` collection / `evaluateAlerts()` loop, four triggers (opens / last day /
allotment+listing / GMP threshold), pure logic in `src/lib/alerts/ipoAlerts.ts`. UI:
`/dashboard/ipos` (`IposPageClient` + `IpoRow`) + an `IpoOpenCard` on the dashboard home.
Prod seeded with 39 real IPOs; the GH Actions refresh is inert until its secret + default
branch are set.

## Screener (`/dashboard/screener`)

Full detail + the bulk-ingestion pipeline: [ADR 0025](./decisions/0025-screener-bulk-ingestion-and-shared-filter-schema.md).

Filter the ~2,570-company NSE universe by market cap, P/E, P/B, ROE, ROCE, dividend yield,
debt/equity, and 3y sales/profit growth CAGR, plus sector/industry — the first bulk,
out-of-band ingestion pipeline in `fundamentals-api` (every other table there is populated
lazily, per company, on read). A new `screener_metrics` Postgres table (every numeric column
individually btree-indexed) is refreshed by `scripts/refresh_screener_universe.py` →
`POST /screener/ingest`, mirroring `refresh_ipos.py`'s shape exactly; a daily GitHub Actions
cron (`.github/workflows/refresh-screener.yml`) exists but the full-universe run hasn't been
reviewed yet, so it isn't activated (see the ADR's verification-status note). **Shared filter
schema**: one `RANGE_FIELD_DEFS` array (`src/lib/dashboard/screenerSchema.ts`) derives both the
UI's field list and its Zod schema, and `runScreener()` (`src/lib/dashboard/screener.ts`) is the
one function three callers share — the Screener page, `GET /api/screener`, and Mitra's
`run_screener` MCP tool — so Mitra structurally cannot express a filter the UI can't. v1 is
fixed-field min/max + sector-equality only, no custom query/expression builder (deliberately
deferred). UI: `/dashboard/screener` — paired min/max range inputs + a sector dropdown
(defaulting to ROE ≥ 15% / Debt-Equity ≤ 1 on first load), a sortable results table linking
each row to the existing stock detail page, an empty state with reset. `run_screener` is a data
tool, not a navigation tool — returns up to 20 matching rows inline, flags truncation.

## AI Insights + Mitra chat (`/dashboard/settings`, insight cards, chat)

Full detail: [archive/ai-insights.md](./archive/ai-insights.md); rationale in
[ADR 0018](./decisions/0018-ai-insights-scope.md).

Neutral AI synthesis on four surfaces (stock read, portfolio insight, IPO brief, Mitra
chat), all **BYO-key** — no MarketMitra-supplied model access. **AI SDK v7** with three
direct adapters (`@ai-sdk/google`, `@ai-sdk/anthropic`, `@openrouter/ai-sdk-provider` — not
the shared-key AI Gateway). Key stored **AES-256-GCM encrypted** in the `userSettings`
collection (`src/lib/crypto.ts`, `SETTINGS_ENC_KEY`), decrypted only server-side.
`getAiConfig(userId, {allowEnv})` resolves: stored key ▸ `AI_*` env **only when
`!isHosted()`** ▸ null; a cold-start DB error degrades to the optimistic "Generate"
affordance via `resolveHasAiKey()`, never a false "add your key" (post-deploy fix — see
archive). **Guardrail on every prompt:** synthesis only, no buy/sell/hold, no price target,
ends "…not investment advice." Insight cache (`src/lib/insights.ts`, `insights` collection):
per-user for stock (24 h) + portfolio (6 h), **cross-user shared** for IPO briefs
(`userId:null`, 12 h); a generation error is never cached. Mitra chat: `POST /api/ai/chat`
streams via the AI SDK's UI-message format (`toUIMessageStreamResponse()` /
`useChat`, ADR 0022 — see below), context from `src/lib/ai/chatContext.ts`. Default Gemini
model is `gemini-3.6-flash` (2.5-flash is retired for new keys).

## Mitra navigation + file-based portfolio import (ADR 0022)

Built (Parts A-D), deployed to production 2026-09-12, not yet archived — this section is
the full reference until a future sign-off pass collapses it. Rationale + the
live-verification notes are in [ADR 0022](./decisions/0022-mitra-navigation-and-file-import.md)
itself.

- **Navigation** — 4 tools in `buildChatTools()` (`navigate_to_dashboard`,
  `navigate_to_portfolio`, `navigate_to_markets`, `open_stock`) plus the 7 MCP tools plus
  `search_context` are the *entire* ToolSet Mitra ever receives — no tool for
  settings/security/billing/destructive actions exists, enforced at the tool-definition
  level (tested as an invariant, not just stated in the prompt). `execute()` only confirms
  the destination; `AiWidget` watches for these tool parts reaching `output-available` and
  calls `router.push`. `PageContext` (mirrors `MaskContext`) lets a page (the stock detail
  page, so far) publish `{ page, ticker, range }` to the globally-mounted widget, folded
  into the system prompt so Mitra can reference "this stock"/"what you're looking at".
- **File-based portfolio import** — attaching a file in the chat widget hits
  `POST /api/portfolio-import/extract` directly (not a chat tool call): CSV/XLSX are
  parsed deterministically (`src/lib/portfolio-import/extractStructured.ts`, `exceljs` +
  `csv-parse`, header row detected by keyword); images/PDF/DOCX go through the user's own
  AI key via `generateObject` (`extractUnstructured.ts` — vision for images, `unpdf`/
  `mammoth` text extraction first for PDF/DOCX). `match.ts` resolves each extraction
  against the fundamentals-api company database (`/search` is substring-only — queries a
  few derived fragments, ranks by edit-distance + a word-boundary prefix bonus for
  same-conglomerate ambiguity). `diff.ts` decides create-vs-update against the caller's
  holdings. **Writes nothing** — returns a proposed change list rendered as
  `ImportPreviewCard` in the chat transcript; only an explicit "Add N holdings" click hits
  `POST /api/portfolio-import/confirm`, the sole route that writes (reusing
  `addHolding`/`updateHolding` as-is, zero AI involvement). Nothing is persisted between
  extract and confirm — closing the chat mid-preview is safe by construction.

## Data flow

The dashboard app shell calls `services/fundamentals-api` directly from Next.js Server
Components (`FUNDAMENTALS_API_URL`, server-to-server — not proxied, since it's an existing
documented service being consumed) for all company/index/news/IPO/quote data, and MongoDB
directly (`src/lib/holdings.ts`, `alerts/store.ts`, `notifications/store.ts`,
`userSettings.ts`, `insights.ts`) for user-owned data. Client-side mutations and
live-as-you-type reads go through thin same-origin `/api/*` proxies (`/api/holdings`,
`/api/alerts`, `/api/notifications`, `/api/search`, `/api/news`, `/api/settings/ai`,
`/api/insights/*`, `/api/ai/chat`). The scheduled work is `GET|POST /api/cron/evaluate-alerts`.
All public endpoints are documented in [`/docs/api-surface.md`](./api-surface.md).

## API surface — MCP server, rate limiting, explorer (Phase 9)

Full detail: [archive/api-surface.md](./archive/api-surface.md); rationale in
[ADR 0019](./decisions/0019-phase-9-api-surface-mcp-rate-limiting.md); per-endpoint reference
in [`/docs/api-surface.md`](./api-surface.md). All live in production.

- **MCP server — `/api/mcp`** (`src/lib/mcp/`, `mcp-handler`@2, a Next route not a standalone
  service). 7 read-only tools wrapping `src/lib/dashboard/*`: `search_symbols`, `get_quote`,
  `get_company_fundamentals`, `get_price_history`, `get_news`, `list_ipos`,
  `get_market_indices`. No auth in v1 (public data; per-user tools deferred). Every result
  carries "not investment advice" / "headline tone" / "unofficial GMP" framing.
  `public/llms.txt` points agents here.
- **Rate limiting** — `@upstash/ratelimit` on `/api/*` (via `src/proxy.ts` middleware) +
  `/api/mcp` + the AI routes (`src/lib/rateLimit.ts`), and a fixed-window limiter on the
  fundamentals-api public endpoints (`app/rate_limit.py` + middleware). Keyed by Clerk
  `userId` else client IP, fails open, no-op when no Upstash creds (self-host). Reads
  `KV_REST_API_*` (Vercel integration) or `UPSTASH_REDIS_REST_*`. Live against an Upstash
  store in `iad1` connected to both Vercel projects.
- **API explorer — `/dashboard/api`** + `public/openapi.json` (CI-checked against the route
  handlers). Pick an endpoint, fill params, send against the deployment with your session,
  copy-as-curl.

## Retrieval (RAG) — chat + insights (Phase 10a)

Full detail: [archive/rag-chat.md](./archive/rag-chat.md); scoping in
[ADR 0020](./decisions/0020-phase-10-rag-chat.md); per-endpoint reference in
[`/docs/api-surface.md`](./api-surface.md). Signed off, deployed, and **verified live on the
hosted instance 2026-09-07**.

A retrieval layer under the existing AI surfaces — **nothing load-bearing**: every piece
degrades to the exact pre-Phase-10 behaviour when vector search or the embedding service is
unavailable.

- **Store** — one `chunks` collection (`src/lib/rag/chunks.ts`) + an Atlas Vector Search
  index. Two partitions by `userId`: `null` = shared public corpus (news; filings where the
  host isn't IP-blocked), a Clerk id = that user's private layer (notes, holdings snapshot,
  recent questions).
- **Embeddings** — **not in the Next app** (`onnxruntime-node` won't load on Vercel). A new
  `services/fundamentals-api` `POST /embed` (`fastembed`, `bge-small-en-v1.5`, 384-dim,
  `IPO_INGEST_TOKEN` bearer); `src/lib/rag/embed.ts` is an HTTP client to it. No
  LLM/embedding API key — BYO-key stays for *generation* only.
- **Indexer** — `POST /api/cron/index-corpus` (`CRON_SECRET` bearer,
  `.github/workflows/index-corpus.yml`, every 2 h): news (chunk → embed → upsert, 45-day
  retention) + annual-report filings.
- **Retrieval** — `src/lib/rag/retrieve.ts` `retrieve()`: query embed → `$vectorSearch`
  over `{ userId ∈ [null, caller] }` (+ `docType`/`symbol` filters). Returns `null`, never
  throws.
- **Agentic chat** — `POST /api/ai/chat` is a tool-calling loop: the 7 MCP data tools +
  `search_context` over `retrieve()`. Guardrail intact. Turns persist (`chatMessages`,
  100/user cap); `DELETE /api/ai/chat` clears history + the corpus entry.
- **Grounded insights** — `retrieveInsightGrounding()` folded into the stock / portfolio /
  IPO insight routes; retrieved passages go into the hashed cache key so a re-index
  invalidates stale insights.
- **Per-user sync** — `src/lib/rag/userSync.ts` + `/api/notes` CRUD + `/dashboard/notes`
  panel + `resyncUserHoldings` on every holdings mutation. All fire-and-forget.
- **Research surface (Phase 10b)** — `POST /api/research` + `/dashboard/research`: a longer
  **structured** brief (fixed markdown sections) on a company / theme / portfolio /
  comparison. Retrieval + synthesis only — no agentic loop (that's Phase 11). Ephemeral (not
  stored). `src/lib/ai/researchPrompts.ts` (pure) + `RESEARCH_SYSTEM`; `MarkdownLite`
  renders the result. Degrades to structured-data-only when retrieval is empty.

## Multi-agent analysis (Phase 11)

Four analyst agents (fundamentals / news+sentiment+retrieval / technical / macro) → a
2-round bull/bear debate → a synthesis briefing (bull case / bear case / agreements /
uncertainties / what would change it / where the evidence currently leans) — ports the
analytical half of TradingAgents as our own TS code, stopping before any trade decision.
Async, checkpointed runs (`agentRuns` collection is the checkpoint) via
`/api/agents/run` → `/api/agents/tick` → `/dashboard/agents`; a daily reflection loop
writes hindsight lessons per user. Merged to `main`/`v2`, tested, verified with a real
live run, and deployed to production. Full detail: [archive/multi-agent-analysis.md](./archive/multi-agent-analysis.md).

## Shipped features (see `/docs/archive/` for detail)

- **Landing page (`/`)** — [archive/landing-page.md](./archive/landing-page.md)
- **Dashboard shell (Phase 3 version, superseded 2026-09-05)** — [archive/dashboard-shell.md](./archive/dashboard-shell.md)
- **Auth pages (`/sign-in`, `/sign-up`)** — [archive/auth-pages.md](./archive/auth-pages.md)
- **Fundamentals data service + real-data dashboard (Phase 4)** — [archive/fundamentals-data-service.md](./archive/fundamentals-data-service.md)
- **Alerts engine (Phase 5)** — [archive/alerts-engine.md](./archive/alerts-engine.md)
- **News feed (Phase 6)** — [archive/news-feed.md](./archive/news-feed.md)
- **IPO tracker + GMP (Phase 7)** — [archive/ipo-tracker.md](./archive/ipo-tracker.md)
- **AI insights + Mitra chat (Phase 8)** — [archive/ai-insights.md](./archive/ai-insights.md)
- **API surface: MCP server + rate limiting + explorer (Phase 9)** — [archive/api-surface.md](./archive/api-surface.md)
