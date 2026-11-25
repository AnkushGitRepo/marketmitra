# Code map

> **Purpose.** Find the right files fast, without listing the whole repo (~1,200 tracked files).
> Directory-level only: it says *where* a thing lives, not how it works — for that see
> [`architecture.md`](./architecture.md) and the ADRs in [`decisions/`](./decisions/).
> **Keep it current:** when you add or rename a top-level folder, a `src/lib/*` or
> `src/components/*` folder, a page or a workflow, update the matching row (one line).
> Verify a path with `git ls-files <dir>` before trusting it.

## How to look something up

1. Know the feature? Use [Feature → files](#feature--files) below.
2. Know a URL? Page = `src/app/(app)/<segment>/page.tsx`; API = `src/app/api/<path>/route.ts`.
3. Know a symbol? `rg -n "<name>" src services` (tests sit next to the code as `*.test.ts`).
4. Know a decision? `ls docs/decisions | grep -i <keyword>` (ADRs, numbered, never pruned).

## Top level

| Path | What it is |
| --- | --- |
| `AGENTS.md` | The rulebook for every coding agent (wins over every other instruction file). `CLAUDE.md`, `GEMINI.md`, `CURSOR.md`, `.cursor/rules/` only point to it. |
| `src/` | The Next.js 16 app (App Router, TypeScript, CSS Modules). |
| `services/fundamentals-api/` | Standalone Python/FastAPI data service (ingestion + serving), Postgres via Alembic. Hosted on Cloud Run (ADR 0060). |
| `public/` | Static assets, `openapi.json` (every API route must be listed — a test enforces it), `llms.txt`, `og-image.png`, `email/` images. |
| `docs/` | All project docs (see [Docs](#docs)). |
| `scripts/` | `deploy-prod.sh`, `release.mjs`, `smoke-test.sh`. |
| `.github/` | CI + scheduled workflows, issue/PR templates, security/contributing docs. |
| `vercel.json` | Vercel config (one daily cron: `evaluate-alerts`). |
| `package.json` | Scripts: `dev`, `build`, `lint`, `typecheck`, `test` (vitest), `release`, `deploy:prod`. |
| `next.config.ts`, `eslint.config.mjs`, `vitest.config.mts`, `tsconfig.json` | Tooling config. |
| `.env.local.example` | Names of every env var (never values). |

## `src/` — the app

| Path | What it is |
| --- | --- |
| `src/proxy.ts` | The Next 16 middleware: Clerk auth (hosted), PAT check, CSRF, rate limits. Its protected-route list must match `src/lib/routes.ts` (a test enforces it). |
| `src/instrumentation.ts` | Server start-up hook. |
| `src/app/` | Routes. `(app)/` = signed-in pages, `api/` = route handlers, plus public pages (`page.tsx` landing, `privacy`, `terms`, `status`, `sign-in`, `sign-up`). |
| `src/components/` | React components, one folder per feature (see [Components](#srccomponents)). |
| `src/lib/` | All non-UI logic, one folder per domain (see [Lib](#srclib)). Pure functions with the clock/network passed in. |
| `src/emails/` | Email rendering: `emails.ts`, `render.ts`, `text.ts`, `tones.ts`, `samples.ts`, `testSend.ts`, and HTML `templates/` (alert, digest, welcome, verify-email, password-reset, promo, whats-new, mitra-summary). |
| `src/styles/tokens.css` | Design tokens. Build against [`design-system.md`](./design-system.md). |

### `src/app/(app)/` — pages (each folder = one URL)

Pages are top-level (`/portfolio`, not `/dashboard/portfolio`; ADR 0037). The page list is
`APP_PAGE_SEGMENTS` in `src/lib/routes.ts`. Each folder has `page.tsx` (server) and usually a
`*PageClient.tsx` (client UI) plus page-local helpers and `*.module.css`.

`dashboard` (home) · `portfolio` · `markets` · `index/[name]` · `screener` · `ipos` · `news` ·
`research` · `agents` · `notes` · `alerts` · `mitra` · `mitra-activity` · `advisor` (+ `journal`,
`performance`, `policy`, `research`, `screen`) · `stock/[ticker]` · `settings` · `system` (+ `emails`) ·
`api-docs` (API explorer, MCP hub, try-it).

A new page must be added to `src/lib/routes.ts` **and** `src/proxy.ts`.

### `src/app/api/` — route handlers (`route.ts`; all answer `{ success, data, error }`)

| Prefix | Purpose |
| --- | --- |
| `advisor/*` | acknowledge, fit, journal, memo, overview, performance, plan, policy, review, screen |
| `agents/*` | run, run/[id], tick (multi-agent analysis) |
| `analysts/*` | analyst desk: list, [symbol], chat, dispatch, retry |
| `ai/chat` | streaming AI chat |
| `alerts`, `alerts/[id]` | alert CRUD |
| `funds`, `funds/export`, `funds/facets`, `funds/compare`, `funds/[code]` (+ `nav`, `peers`, `xray`) | mutual funds (ADR 0067) |
| `holdings`, `holdings/[id]` | portfolio holdings |
| `insights/*` | one-shot AI briefs: ipo, market, news, portfolio, stock, stock-brief, chart-overlay (Auto-Chart), fund-xray |
| `markets/overview`, `news`, `search`, `stock/[ticker]` (+ `prices`) | market data |
| `mitra/*`, `mitra-activity` | Mitra chat: conversations, messages, files, context |
| `mcp` | MCP server endpoint |
| `notes`, `notifications`, `watchlists`, `wishlists` | user data (each has `[id]` / `symbols` children) |
| `portfolio-import/*` | extract + confirm file import (parsing in `lib/portfolio-import/extractStructured.ts` + `normalize.ts`) |
| `research` | research page backend |
| `screener`, `screener/export`, `screener/facets` | screener |
| `settings/*` | ai (+ test), email-alerts, export, guardrails, notifications (+ test), preferences, tokens |
| `onboarding` | first-run wizard state: risk profile, completed / dismissed (ADR 0075) |
| `system/*`, `status`, `version`, `github/repo` | status, logs, email diagnostics, version |
| `cron/*` | scheduled jobs: advisor-review, agents-reflect, analyst-dispatch, evaluate-alerts, index-corpus, refresh-screener-quotes, stock-analysts (guarded by `lib/security/cronAuth.ts`) |

## `src/lib/`

Top-level files: `mongodb.ts` (lazy Mongo client) · `deployment-mode.ts` (`isHosted()` gate,
ADR 0010) · `currentUserId.ts` (`'local'` in self-host; Clerk or PAT when hosted) · `routes.ts`
(page list + legacy redirects) · `rateLimit.ts` (Upstash, no-op without credentials) ·
`crypto.ts` (secret encryption) · `holdings.ts` · `insights.ts` · `userSettings.ts` · `version.ts`.

| Folder | What lives there |
| --- | --- |
| `advisor/` | Local-only Mitra Advisor (ADR 0035/0064). Sub-folders: `allocation`, `behaviour` (dip + trade checks), `diagnostics` (fit, stress, drawdown, deployment), `journal` (+ kill monitor, review job), `memo`, `performance` (paper), `policy`, `screen`; plus `guard.ts`, `flag.ts`, `pageGuard.ts`, `disclaimer.ts`, `chatTools.ts`. |
| `agents/` | Multi-agent analysis: `orchestrator`, `runner`, `prompts`, `context`, `indicators`, `lessons`, `reflect`, `tradeActionCheck`, `store`, `types`. |
| `ai/` | AI SDK layer (`ai/research/` = the research agent's web search and page-reading tools and the runner that uses them, #364, ADR 0081): `providerCatalog` (the eleven providers and their model lists), `modelList`/`pickerModels` (the live model list and picker grouping, #333), `providers`, `client`, `userAiConfig` (bring-your-own key), `prompts` (holds `GUARDRAIL`), `generate`/`structuredGenerate`, `stockBrief`/`structuredBrief`, `brief*`, `chatTools` (+ `askUserTool`, `a2uiTools`: tools that answer with an A2UI card, for Mitra chat and the Analyst Desk chat), `platformApi*`, `untrusted.ts` (prompt-injection fencing). |
| `alerts/` | Alert evaluation: `evaluate`, `evaluators`, `guardrails`, `ipoAlerts`, `marketHours`, `mitraBounds`, `portfolioMetrics`. |
| `analysts/` | Per-stock analyst desk: `engine`, `dispatch*`, `sweep*`, `caps*`, `criteria`, `memo`, `retry`, `store`, `desk*`, chat prompts/context. |
| `api-docs/` | Data behind the `/api-docs` page: categories, checks, MCP clients/tools. |
| `auth/` | `accounts` (Clerk account helpers), `admin`, `clientSession`. |
| `chart/` | Pro chart logic: `bars`, `drawings`, `indicators`, `fallback`. |
| `chat/`, `mitra-chat/`, `mitra/` | Chat history; Mitra workspace (conversations, attachments, file stores, summarise, windowing, starters); activity log. |
| `dashboard/` | Client-side data layer: fundamentals/IPO/news/Yahoo clients, `quotes`, `stockAggregate`, `enrichedHoldings`, `heroMetrics`, formatting, search hook, mask/page contexts. |
| `email/`, `notifications/`, `welcome/` | Email sending + diagnosis; notification channels, delivery, store; one-time welcome email. |
| `github/`, `release/`, `version.ts` | Repo stats, release helpers, version. |
| `http/`, `net/` | Shared HTTP error mapping; `retry`. |
| `markets/`, `news/`, `stock/`, `screener/` | Market overview/pulse + TTL cache; news feed/topics; stock-page helpers (ranges, key ratios, sensitivity, signals); screener columns, params, presets, CSV, bulk quotes, Mitra screener. |
| `mcp/` | `server.ts` + `tools.ts`: read-only MCP tools wrapping `dashboard/*` clients (ADR 0019). |
| `mic/`, `shortcuts/` | Dictation guidance; keyboard shortcuts. |
| `notes/`, `wishlists/`, `preferences/`, `settings/`, `tokens/` | User notes; wishlists; preferences schema/store; settings tabs/export/confirm; personal access tokens (`pat.ts`, `store.ts`). |
| `portfolio/`, `portfolio-import/` | Portfolio metrics; file import (structured/unstructured extract, match, diff). |
| `rag/` | Retrieval: `chunk`, `embed` (calls the data service `/embed`), `indexer`, `retrieve`, `userSync`, `pdfTextClient`. |
| `scheduler/` | Local (self-host) schedules: `localSchedule`, `localAiSchedule`. |
| `security/` | `cronAuth`, `csrf`, `outbound` (SSRF defence), `safeHref`, `secrets`. |
| `system/` | `eventLog`, `health`. |

## `src/components/`

One folder per feature, each with `*.module.css`; shared pieces in `common/`.

`advisor` · `alerts` · `analysts` · `appshell` (Sidebar, AppHeader, MobileTabBar, `navItems.ts`, notifications, AI widget) ·
`auth` (Clerk wrappers, `clerkAppearance.ts`) · `common` (ConfirmDialog, KebabMenu, DataUnavailable, InfoPopover) ·
`dashboard-charts` (cards and chart widgets used on dashboard/stock pages) · `ipos` · `landing` (public site) ·
`markets` · `mitra` (character) · `mitra-chat` · `news` · `portfolio` · `pro-chart` (lightweight-charts workspace) ·
`screener` · `settings` · `stock` (deep dive, financials, peers, signal matrix) · `watchlists`.

## `services/fundamentals-api/` (Python / FastAPI)

| Path | What it is |
| --- | --- |
| `app/main.py` | App entry. |
| `app/api/routes/` | HTTP routes: companies, documents, embed, financials, funds, indices, ipos, news, pdf_text, prices, quote, screener, search. `app/api/deps.py` = shared deps. |
| `app/services/` | Query/serving logic: fundamentals, ipo, news, screener, search (+ index); mutual funds: `mf_query` (reads), `mf_ingest` (writes), `mf_metrics` (pure returns/risk maths). |
| `app/ingestion/` | Data sourcing in three tiers (ADR 0011): `tier1_nse_bse`, `tier2_yfinance`, `tier3_*` scrapers, plus `orchestrator`, `quotes`, `news`, `indices`, `mf_amfi` + `mf_mfapi` (mutual fund master/NAV, ADR 0067), `embeddings`, `pdf_*`, `xbrl_parser`, `filing_discovery`, `company_master`, `rate_limit`. |
| `app/db/`, `migrations/versions/` | SQLAlchemy models/session; Alembic migrations. |
| `app/schemas.py`, `config.py`, `security.py`, `rate_limit.py` | Pydantic schemas, settings, auth tokens, per-IP limiting. |
| `scripts/` | `refresh_ipos.py`, `refresh_screener_universe.py`, `refresh_funds.py` (mutual funds). |
| `deploy-cloud-run.sh`, `Dockerfile` | Deploy (see HANDOFF for the `CLOUDSDK_PYTHON` note). |
| `tests/` | pytest. |

## `.github/workflows/`

`ci.yml` (lint, typecheck, test, build, python) · `codeql.yml` · `dependency-review.yml` · `release.yml` ·
`post-deploy-smoke.yml` · `wiki-sync.yml` · scheduled jobs that call the app/data service:
`evaluate-alerts`, `agents-tick`, `agents-reflect`, `analyst-dispatch`, `stock-analysts`, `index-corpus`,
`refresh-ipos`, `refresh-funds`, `refresh-screener`, `refresh-screener-quotes`.

## Docs

| Path | What it is |
| --- | --- |
| `HANDOFF.md` | Current state, open work, run/deploy, gotchas — read first. |
| `session-log.md` | Newest ~12 sessions; older in `archive/session-log/YYYY-MM.md`. |
| `architecture.md`, `design-system.md`, `api-surface.md`, `data-sources.md`, `ROADMAP.md` | Reference docs. |
| `decisions/` | ADRs `NNNN-slug.md` (next number: see AGENTS.md). |
| `wiki/` | Source of the published GitHub wiki. |
| `archive/` | Detailed write-ups of shipped features. |

## Feature → files

| Feature | Page | API | Logic | UI |
| --- | --- | --- | --- | --- |
| Dashboard home | `(app)/dashboard` | `markets/overview`, `news` | `lib/dashboard`, `lib/markets` | `components/dashboard-charts`, `appshell` |
| First-run onboarding | `onboarding`, `onboarding/demo` (outside `(app)/`) | `onboarding` | `lib/onboarding` (`profiles`, `gate`, `state`, `holdingInput`, `holdingsSummary`, `demoPortfolio`) | `components/onboarding` |
| Portfolio + import | `(app)/portfolio` | `holdings`, `portfolio-import/*` | `lib/holdings.ts`, `lib/portfolio*` | `components/portfolio` |
| Stock page / brief | `(app)/stock/[ticker]` | `stock/[ticker]`, `insights/stock-brief` | `lib/stock`, `lib/ai/stockBrief.ts`, `lib/chart/aiOverlay.ts`, `lib/chart/overlayRuns*.ts`, `lib/chart/timeframes.ts`, `lib/dashboard/yahooCandles.ts` | `components/stock`, `pro-chart` |
| Screener | `(app)/screener` | `screener/*`, cron `refresh-screener-quotes` | `lib/screener` | `components/screener` |
| Mutual funds | `(app)/funds`, `(app)/funds/[code]` | `funds/*`; data service `funds`; job `refresh-funds` | `lib/funds` | `components/funds` |
| IPO tracker | `(app)/ipos` | data service `ipos` | `lib/dashboard/ipo*` | `components/ipos` |
| News + sentiment | `(app)/news` | `news`, `insights/news` | `lib/news` | `components/news` |
| Alerts + notifications | `(app)/alerts` | `alerts`, `notifications`, cron `evaluate-alerts` | `lib/alerts`, `lib/notifications`, `lib/email` | `components/alerts`, `emails/` |
| Mitra chat | `(app)/mitra` | `mitra/*`, `ai/chat` | `lib/mitra-chat` (`askUser.ts`: clarifying-question tool helpers; `holdingProposal.ts`: add/update/remove-holding proposal card helpers (ADR 0080); `toolActivity.ts`: the stage Mitra is in and the "Used N tools" grouping; `followUps.ts`: the follow-up chip block at the end of a reply; `a2ui/`: A2UI card builders, `portfolioSnapshot.ts`, `analystCards.ts`, shared `kit.ts`), `lib/ai`, `lib/rag` | `components/mitra-chat` (`AskUserCard`, `A2uiView`) |
| Analyst desk | `(app)/research`, `agents` | `analysts/*`, `agents/*`, crons | `lib/analysts`, `lib/agents` | `components/analysts` |
| Research brief | `(app)/research`, `(app)/notes` | `research`, `notes/*` | `lib/research` (`report/` = the chapter report, ADR 0081: statements, cash-flow, valuation, governance and risk blocks, `tasks` (prompts and reply parsers), `run` (streams chapters as they finish), `gather`, `liveDeps`; the route is `api/research/report`; `symbolAliases`, `resolveSymbol`, `themes`, `themeFacts`, `ratioSummary`; report blocks: `blocks`, `companyData`, `companyBlocks`, `comparisonBlocks`, `financialSeries`, `themeBlocks`, `portfolioBlocks`, `thesis`, `blocksMarkdown`, `chartMath`, `formatters`), `lib/ai/researchPrompts.ts`, `lib/notes` (`limits`, `schema`, `vault` = filters/search/preview), `lib/research/saveNote.ts`, `lib/print` (Export PDF) | `components/research` (`SymbolCombobox`, `ReportActions`, `report/` = the streamed company report: `useCompanyReport`, `CompanyReportView`, `ChapterSection`, `blocks/` = report renderers, `FinancialChart` = sales/margin combo chart), `components/notes` (two-pane vault) |
| Mitra Advisor (local) | `(app)/advisor/*` | `advisor/*`, cron `advisor-review` | `lib/advisor` | `components/advisor` |
| Settings / tokens / AI key | `(app)/settings` | `settings/*` | `lib/settings`, `lib/tokens`, `lib/preferences`, `lib/ai/userAiConfig.ts` | `components/settings` |
| Public API + MCP | `(app)/api-docs` | `mcp`, every route | `lib/mcp`, `lib/api-docs`, `public/openapi.json` | `app/(app)/api-docs/*` |
| Auth / hosted gate | `sign-in`, `sign-up` | — | `proxy.ts`, `lib/deployment-mode.ts`, `lib/currentUserId.ts`, `lib/security` | `components/auth` |
| System status | `(app)/system`, `status` | `system/*`, `status` | `lib/system` | — |
| Landing / legal | `page.tsx`, `privacy`, `terms` | — | — | `components/landing` |
