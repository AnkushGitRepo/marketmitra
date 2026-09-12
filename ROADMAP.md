# MarketMitra v2 — Master Build Roadmap

This is the entry-point document for building MarketMitra v2 across many sessions and many days. Read this first in any new chat, alongside `CLAUDE.md`. This document tracks *what phase we're in and what's left in it* — `CLAUDE.md` stays a short pointer, `/docs/architecture.md` describes the system as it stands, and this file is the actual working checklist.

## How to use this document

- Find the current phase (marked 🔄 below). Read its checklist. Work through unchecked items in order unless they're explicitly parallel. **As of 2026-09-06: Phases 0–9 are ✅ (signed off, archived, in production). Phases 10 (RAG) / 11 (multi-agent) stay ❓ — need a scoping session, not a build.** Non-blocking leftovers (scheduler activation, Resend email, real alert/IPO-alert fire tests, DRHP grounding) live under "Post-sign-off follow-ups" after Phase 8 — each needs a user action.
- **After completing any single checklist item** — not just at the end of a phase — do all of the following before moving to the next item:
  1. Check the box in this file.
  2. If the item involved a real decision (a library choice, a schema choice, a structural change), add or update an ADR in `/docs/decisions/`.
  3. If the item changed the system's structure, update `/docs/architecture.md`.
  4. Append one line to `/docs/session-log.md`.
- This is more frequent than the archiving/pruning protocol from earlier — pruning old detail into `/docs/archive/` only happens when the user explicitly approves a phase as done. Checking boxes and logging happens continuously, every session, without waiting for approval.
- When a phase is fully checked off, stop and tell the user it's ready for review — don't self-approve and move to the next phase or run the pruning protocol without their explicit sign-off.
- Legend: ✅ Done · 🔄 In progress · ⬜ Todo · ⏸️ Deferred (no ETA) · ❓ Needs a dedicated discussion session before any build prompt is written — do not build from assumptions here.

---

## Phase 0 — Context Architecture ✅
`CLAUDE.md`, `/docs/decisions/`, `/docs/architecture.md`, `/docs/session-log.md`, `/docs/archive/` structure in place.

## Phase 1 — Teardown ✅
v1 code removed, history preserved, teardown committed as its own commit.

## Phase 2 — Scaffold + Deployment-Mode Gate ✅
- [x] Next.js (App Router, TypeScript) scaffold, ESLint/Prettier
- [x] Clerk deployed on the production (hosted) instance
- [x] Implement `NEXT_PUBLIC_DEPLOYMENT_MODE` (`hosted` | `selfhost`, defaults to `selfhost`) gate — see [ADR 0010](./docs/decisions/0010-deployment-mode-gate.md); implemented in `src/lib/deployment-mode.ts` + gated at every Clerk/billing mount point
- [x] Set `NEXT_PUBLIC_DEPLOYMENT_MODE=hosted` explicitly in the production Vercel environment — confirmed done by user 2026-09-04
- [x] Verify self-host mode skips Clerk and all billing UI entirely — confirmed 2026-09-04: `/dashboard` opens with 200 (no login), `/sign-in`+`/sign-up` 307-redirect to `/dashboard`, landing page has zero `pricing`/`#faq` references
- [x] Verify hosted mode is unchanged from current behavior once the flag is set — confirmed 2026-09-04: `/dashboard` redirects unauthenticated visitors through Clerk's handshake flow (matches prod), `/sign-in` renders the real widget, pricing section present; `npm run build` / `tsc --noEmit` / `eslint` all clean

## Phase 3 — Landing + Auth + Dashboard Shell ✅
- [x] Landing page design (hero, dashboard preview, features, pricing cards, FAQ, footer)
- [x] Sign-in / sign-up screens — on-brand split layout, border-clipping and composition bugs fixed
- [x] Final landing + auth designs implemented and approved
- [x] Implemented in Next.js + CSS Modules per `/docs/design-system.md`
- [x] Dashboard shell (empty-state layout only, no real feature data yet)
- [x] Responsive/mobile pass on all three surfaces — verified at 390px/820px/1440px+
- **Archiving protocol already run for this phase** — full build detail lives in [`/docs/archive/landing-page.md`](./docs/archive/landing-page.md), [`/docs/archive/dashboard-shell.md`](./docs/archive/dashboard-shell.md), [`/docs/archive/auth-pages.md`](./docs/archive/auth-pages.md); `/docs/architecture.md` holds the current summaries.

## Phase 4 — Fundamentals Data API (screener.in-equivalent) ✅
**Signed off 2026-09-06.** Full build detail archived to [`/docs/archive/fundamentals-data-service.md`](./docs/archive/fundamentals-data-service.md); `/docs/architecture.md` holds the summary. Carried-forward follow-up (Tier 1 filing-URL discovery) is under "Post-sign-off follow-ups" below.

Superseded plan: no paid vendor (EODHD dropped), no hosted/self-host split for data access — see [ADR 0011](./docs/decisions/0011-three-tier-fundamentals-data-sourcing.md). Built as a standalone Python/FastAPI service under `services/fundamentals-api/` (scoped exception to ADR 0004), Postgres-backed (not MongoDB, scoped to this service). Full detail: [`services/fundamentals-api/README.md`](./services/fundamentals-api/README.md).
- [x] Storage decision confirmed — PostgreSQL, not MongoDB (this service's data is naturally tabular/relational)
- [x] Schema defined — `app/schemas.py` (pydantic v2) + `app/db/models.py` (SQLAlchemy), migrated via Alembic, applied against a real local Postgres instance
- [x] Tier 1 (NSE/BSE) ingestion built — `nsepython`/`bsedata` quotes, direct-call NSE shareholding endpoint, XBRL parser, PDF table extractor. NSE itself is frequently blocked (Akamai edge, confirmed during dev) — expected, not a bug; `bsedata` verified working live.
- [x] Tier 2 fallback built — `yfinance` (price history + quote gap-fill), replacing the dropped paid-vendor (EODHD) plan entirely
- [x] Tier 3 fallback built — Scrapling against Screener.in, isolated module, verified against two real companies (Reliance live fetch, Newgen Software saved-page fixture)
- [x] Serving layer built — FastAPI endpoints for company/ratios/shareholding/financials/prices/documents, `source_tier` visible on every response; 25 tests pass offline (no network/DB)
- [x] Tier 1 filing-URL discovery step — done 2026-09-06 (after sign-off). `app/ingestion/filing_discovery.py`: NSE `/api/corporates-financial-results` (primary) + BSE `AnnGetData` (fallback) → most-recent results filing → `xbrl_parser` / `pdf_financials` extract it as the latest period; Screener fills the history + is the fallback. Fixture-tested (13 cases), fails safe. See "Post-sign-off follow-ups".
- [x] Dashboard/Portfolio/Markets/Stock UI built — `/dashboard`, `/dashboard/portfolio`, `/dashboard/markets`, `/dashboard/stock/[ticker]`, from an approved Claude Design import, fonts swapped to project standard (Manrope/JetBrains Mono).
- [x] UI wired to real data, mock data removed entirely (`src/lib/dashboard/mockData.ts` deleted) — see [ADR 0012](./docs/decisions/0012-portfolio-holdings-and-real-data-wiring.md):
  - Stock detail page: fully real (ratios, financials, shareholding, price history) via fundamentals-api, for any real NSE symbol.
  - Markets/Dashboard: real Indian indices (NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX) via a new fundamentals-api `/indices` endpoint (yfinance); gainers/losers scoped to a real 10-stock watchlist (`src/lib/dashboard/watchlist.ts`), not a market-wide screener (no such data source exists).
  - Portfolio: real, working feature — new `holdings` MongoDB collection + `/api/holdings` CRUD routes + add/edit/delete UI. Diversification score, target progress, benchmark comparison, and drift-from-target were dropped (no real data/config source existed for them even in the mock) in favor of real concentration facts, sector allocation, and per-holding unrealized P&L.
  - Fixed a real bug found in the process: the shareholding scraper only captured the latest quarter, not the full history Screener shows — now captures all available quarters (typically 12).
- [x] Company logos everywhere an avatar shows (movers, holdings, stock header, search) — real per-symbol logos with initials as a genuine fallback (confirmed the source 404s for real on unlisted tickers).
- [x] Search upgraded from the 10-stock watchlist to the full NSE universe — ~2,570 real listed equities + the 4 tracked indices, via a new fundamentals-api `/search` endpoint sourced from NSE's own published equity list.
- [x] MongoDB Atlas connectivity resolved (user opened the IP allowlist to `0.0.0.0/0`) — portfolio holdings add/edit/delete verified live end-to-end, not just built. Also fixed a real resilience bug found along the way: no connection timeout meant an unreachable cluster hung every page load for ~20-30s.
- [x] fundamentals-api hosted in production — Vercel Python serverless function + Neon Postgres marketplace integration, both inside the existing Vercel account (no new third-party accounts created); see [ADR 0013](./docs/decisions/0013-fundamentals-api-vercel-hosting.md). Live at `https://marketmitra-fundamentals-api.vercel.app`, verified end-to-end (`/health`, `/indices`, `/search`, `/companies/{symbol}`, `/companies/{symbol}/ratios` all confirmed serving real data). Next.js app (`marketmitra-v2`) redeployed with `FUNDAMENTALS_API_URL` pointed at it — real data confirmed flowing through `/api/search` in production.
- [x] Peer comparison, About (business description), and annual-report documents added — none of these existed before (peer comparison was never built; the Documents endpoint always returned `[]`). All Tier 3 (Screener.in): `about` backfilled once per company, peer comparison cached with the same TTL as ratios (including an AJAX fallback for large caps whose peer table Screener lazy-loads — confirmed working for Reliance, not for TCS, an accepted unofficial-access inconsistency, not a chased bug), annual reports populated directly from Screener's BSE-hosted PDF links (no Tier 1 filing-discovery needed for this specific document type). New `peer_comparisons` table + `companies.about` column, migrated. Wired into the stock detail page: a new About card, a new Peer comparison table, and the previously-empty Documents card now lists real, clickable annual report PDFs. 30/30 tests pass (was 25).
- [x] Confirmed as done by the user 2026-09-06; archiving protocol run — detail moved to [`/docs/archive/fundamentals-data-service.md`](./docs/archive/fundamentals-data-service.md).

**Resolved 2026-09-06 — [ADR 0016](./docs/decisions/0016-landing-page-no-paid-tier-reconciliation.md):** landing "Pricing" section reframed as "Two ways to run it" (both free); trial/price/AI-cap UI removed; FAQ rewritten; AI insights are BYO-key in every mode; the hosted shared instance's fair-use **rate limiting is now a stated expectation but not built** — tracked for Phase 9 / infra, below. `isHosted()`'s auth gating unchanged.

## Phase 5 — Alerts (stop loss, target, price / %-move / 52w / portfolio) ✅
**Signed off 2026-09-06.** Full build detail archived to [`/docs/archive/alerts-engine.md`](./docs/archive/alerts-engine.md). Follow-ups (GH Actions scheduler activation, Resend email, one real fire test) are under "Post-sign-off follow-ups" below.

Scoped 2026-09-06 — see [ADR 0014](./docs/decisions/0014-alerts-engine-scope.md) for the full rationale. v1 = four trigger types, in-app notification center as the always-on delivery baseline plus config-gated email + webhook, evaluated by a Vercel Cron hitting a secret-guarded API route ~every 10 min during NSE hours. Delivery is built as a generic notification subsystem so Phase 7/8 reuse it. Full parity in self-host mode (operator triggers the cron route themselves if not on Vercel).

**Backend — fundamentals-api (one new endpoint):**
- [x] `GET /quote?symbols=A,B,C` — batched live quote: `{ symbol, price, prev_close, change_pct, week52_high, week52_low, as_of, source_tier }`, yfinance `fast_info` backed, 60s in-process TTL cache (`quote_cache_ttl_seconds`), tracked index names resolve too, bad symbols dropped not faked, capped at 100/request. `app/ingestion/quotes.py` + `app/api/routes/quote.py`. 6 offline tests (monkeypatched yfinance), 36/36 suite green; verified live for RELIANCE/TCS/NIFTY 50. Documented in the service README + `/docs/data-sources.md`.

**Backend — main app (Next.js):**
- [x] `alerts` MongoDB collection + data-access — `src/lib/alerts/store.ts` + `types.ts` (userId via existing `currentUserId.ts` split; schema per ADR 0014 §5, incl. `armed`/`cooldownUntil` re-arm gate). `listActiveAlerts()` for the cron, `applyAlertTransition()` for post-cycle writes, `updateAlert()` resets the re-arm gate on edit/reactivate.
- [x] `notifications` MongoDB collection + generic subsystem — `src/lib/notifications/{types,store,channels,deliver}.ts`. `deliverNotification(userId, payload, channels)` always writes the in-app record then fans out; `resolveChannels(userId)` derives email/webhook from env (never gated on `isHosted()`); `kind` field so Phase 7/8 reuse it. Webhook channel fully implemented; email is a clean no-throw seam that reports `skipped` until a provider is provisioned (ADR 0014 open dep).
- [x] Pure evaluators — `src/lib/alerts/evaluators.ts`: `evaluatePriceThreshold` / `evaluatePercentMove` / `evaluate52WeekBreach` / `evaluatePortfolioPnl` (all no-I/O), plus `decideAlertTransition` (one-shot vs re-arm + cooldown + hysteresis) and `snapshotFromQuote`. `tsc`/`eslint` clean. **Unit tests still pending — see the test item below.**
- [x] `src/lib/dashboard/fundamentalsApi.ts` → `getQuotes(symbols[])` client for the new `/quote` endpoint (`cache: 'no-store'`).
- [x] `GET/POST /api/alerts`, `PATCH/DELETE /api/alerts/[id]` — Zod-validated (discriminated union on `type`; PATCH validates `params` against the loaded alert's type), session-scoped via `currentUserId.ts`. Supporting: `src/lib/alerts/schemas.ts`, `getAlertById()` in the store. Documented in `/docs/api-surface.md`.
- [x] `GET /api/notifications` (list + `meta.unread`), `POST /api/notifications/read` (`{id}` one / `{}`|`{all:true}` all). Documented.
- [x] `GET|POST /api/cron/evaluate-alerts` — `CRON_SECRET` bearer guard (dev-open, prod-`503` when unset), `?force=1` bypass, `isNseSession()` gate (`src/lib/alerts/marketHours.ts`, `Intl` IST parts, Mon–Fri ~09:15–15:35, deliberately not holiday-aware per ADR 0014), graceful degradation (`skippedNoData` count, never fires on missing data). Loop lives in `src/lib/alerts/evaluate.ts` (batches quotes, computes whole-book + per-holding metrics via `src/lib/alerts/portfolioMetrics.ts`, builds per-type notification copy). Documented. GET because Vercel Cron issues GET.
- [x] Root `vercel.json` cron — intended `*/10 3-10 * * 1-5` but the **Hobby plan rejects sub-daily crons**, so shipped `0 4 * * *` (once daily ≈ 09:30 IST; the route's session gate handles weekends). Real cadence comes from an external scheduler on the `CRON_SECRET`-guarded route (README recipe). ADR 0014 amendment 2026-09-06.
- [x] ~~Email provider provisioned~~ → **deferred to a follow-up** (ADR 0014 amendment 2026-09-06). `discover --category messaging` returns only Resend, which needs a new third-party integration + a verifiable sending domain (`.vercel.app` can't be verified). v1 ships **in-app + webhook**; webhook covers every "notify me elsewhere" case. `sendEmail` in `src/lib/notifications/channels.ts` stays a config-gated no-throw seam — wiring Resend later is `npm install resend` + the seam + a template + one live test, no engine refactor. Tracked below under "Phase 5 follow-ups".

**Frontend:**
- [x] `/dashboard/alerts` route in the app shell — `page.tsx` (server, reads `?new=1&symbol=` for the stock-page hand-off), `AlertsPageClient.tsx` (list grouped by status, create/edit inline, pause/resume/re-activate/delete), `AlertForm.tsx` (type-switched param fields, re-arm + cooldown), `alertText.ts` (pure describe/status helpers), `page.module.css`. "Alerts" added to `AppHeader` nav + `isNavActive`.
- [x] "Set alert" affordance on `/dashboard/stock/[ticker]` — button in the price column → `/dashboard/alerts?new=1&symbol=<sym>`, form opens prefilled.
- [x] Notification bell + dropdown in `AppHeader` (`NotificationBell.tsx` + `.module.css`) — polls `/api/notifications` on mount / every 60s / on window focus, unread badge, click-through marks read + navigates to `href`, "Mark all read". Mounted in both the desktop actions and the mobile header; `MobileTabBar`'s dead "Search" tab swapped for "Alerts".
- [x] Built against `/docs/design-system.md` + the `--app-*` token subset (cards, pills, `linkButton`/`linkButtonDanger`, `formError` all reused from the portfolio page's language). Verified live in selfhost mode via Playwright: empty state, form, created-alert card, and the full create→list→pause→delete API round-trip against real MongoDB; cron `?force=1` ran and degraded gracefully (`skippedNoData`) with fundamentals-api `/quote` not yet deployed.

**Cross-cutting:**
- [x] Works in both deployment modes — `getCurrentUserId()` (`local` in selfhost), email/webhook gated on `RESEND_API_KEY`/`ALERT_WEBHOOK_URL`/`ALERT_EMAIL_TO` config, **not** `isHosted()`; in-app notifications always on. Cron route is `CRON_SECRET`-guarded and outside `proxy.ts`'s auth; README "Alerts evaluation (cron)" section has the self-host `curl` recipe.
- [x] Test runner set up (vitest — repo's first for the Next.js side; `npm test` / `test:watch`, `vitest.config.mts`, node env, `src/**/*.test.ts`). Table-driven unit tests for the pure logic: `evaluators.test.ts` (4 evaluators + `decideAlertTransition` cooldown/hysteresis state machine + `snapshotFromQuote`), `marketHours.test.ts` (IST session incl. UTC-vs-IST calendar-day edge), `portfolioMetrics.test.ts` (whole-book + single-holding, unpriced-holding exclusion). **50 tests green**, `tsc`/`eslint`/`next build` all still clean.
- [x] Remaining test coverage: `evaluate.test.ts` (the `evaluateAlerts()` loop, mocked store/quotes/delivery — fire, no-fire, skippedNoData, portfolio P&L, delivery-failure resilience) + `alerts.route.test.ts` / `notifications.route.test.ts` / `cron.route.test.ts` (handlers called directly with mocked `currentUserId`/store; covers the discriminated-union validation, PATCH type-aware param validation, and the full `CRON_SECRET` guard matrix). **78 tests green** total.
- [x] `/docs/architecture.md` "Alerts engine" section added; README + `.env.local.example` document `CRON_SECRET` / `ALERT_WEBHOOK_URL` / `ALERT_EMAIL_TO` and the self-host cron `curl` recipe.
- [x] Confirmed as done by the user 2026-09-06; archiving protocol run — detail moved to [`/docs/archive/alerts-engine.md`](./docs/archive/alerts-engine.md).

**Phase 5 follow-ups (do not block sign-off) — remaining items now consolidated under "Post-sign-off follow-ups" after Phase 8:**
- [x] Deployed 2026-09-06: `services/fundamentals-api` redeployed with `/quote` (verified live — real RELIANCE/TCS/NIFTY 50 quotes). `marketmitra-v2` redeployed with `vercel.json`'s daily cron + `CRON_SECRET` set on it (Secret type). Post-deploy prod checks pass: landing 200, `/api/search` regression OK, cron route `401` without token / `{ran:true, errors:0}` with it. `@types/node` bumped `^20→^24` so Vercel's strict `npm install` resolves the vitest/vite peer.
- [~] Real ~10-min cadence: `.github/workflows/evaluate-alerts.yml` written (every 10 min during market hours, hits the `CRON_SECRET`-guarded route). **Activate:** `gh secret set CRON_SECRET` + make this the repo's default branch (GitHub runs `schedule:` only from the default branch; `workflow_dispatch` works from any branch). Or use cron-job.org / a home crontab instead.
- [→] Email delivery (Resend) — see "Post-sign-off follow-ups" below.
- [→] Verify one real alert fires end-to-end during NSE market hours — see "Post-sign-off follow-ups" below.

**Explicitly out of v1 scope** (ADR 0014): email (deferred, above), browser/Web Push, NSE trading-holiday calendar, SMS, per-user quiet hours, digest/batched notifications, alert history/analytics beyond the notification list.

## Phase 6 — News Feed (stock/company news) ✅
**Signed off 2026-09-06.** Full build detail archived to [`/docs/archive/news-feed.md`](./docs/archive/news-feed.md).

Scoped 2026-09-06 — see [ADR 0015](./docs/decisions/0015-news-feed-scope.md). v1 = hybrid free sourcing (broad Indian-markets RSS for the global stream + Google News RSS per-symbol for stock/portfolio views), ingestion in `fundamentals-api` with lazy TTL refresh (no new cron), a VADER headline-tone sentiment tag per item, and three UI surfaces. No news notifications in v1 (Phase 5's `deliverNotification` is ready for that as a follow-up).

**Backend — fundamentals-api:**
- [x] Deps: `feedparser` + `vaderSentiment` in `pyproject.toml` + trimmed `requirements.txt`. `news_broad_cache_ttl_minutes` (30) / `news_symbol_cache_ttl_minutes` (60) / `news_retention_days` (30) in `config.py`.
- [x] Migration `31f04c1b3507` — `news_items` (deduped on `url`, `published_at` indexed) + `news_item_symbols` (`symbol` indexed). Hand-written (no local Postgres to autogenerate against). **Still to apply against prod Neon at deploy time.**
- [x] `app/ingestion/news.py` — `fetch_broad_items()` (5 verified feeds: ET/LiveMint/BusinessLine/Moneycontrol/NDTV Profit — Business Standard 403s, dropped), `fetch_symbol_items()` (Google News RSS by company name), `matcher_name()`/`build_name_pattern()`/`tag_symbols()` (word-bounded, multi-word names only), `score_sentiment()` (VADER → 3-way + rounded score), HTML-stripped summaries. All sync work via `asyncio.to_thread`.
- [x] `app/services/news_service.py` — `get_news()` with lazy TTL refresh-on-read (broad + per-symbol), keyset cursor pagination (`_encode_cursor`/`_decode_cursor`), URL-dedup upsert + symbol linking, 30-day prune, name-index built from `company_master`, `refresh_all()` for an optional warm-up cron, `TRACKED_SYMBOLS` curated set.
- [x] `GET /news` (`?symbols=`, `?limit=`, `?cursor=`) → `{ items[], next_cursor }`, registered in `main.py`. **14 offline tests** (RSS fixtures for broad + Google News, name-matching, VADER labelling, cursor round-trip, staleness, route shape/422); fundamentals-api suite 50/50, ruff clean. Live-verified: broad feeds returned ~140 real items, Google-News-per-symbol returned 64 for RELIANCE with real publisher attribution.
- [x] Service README (endpoint list + "News feed" section + coverage-table row, test count 36→50) and `/docs/data-sources.md` (RSS-feeds entry + Google News RSS entry, each with a ToS line) updated.

**Frontend — Next.js:**
- [x] `src/lib/dashboard/newsApi.ts` — `getNews({symbols?, limit?, cursor?})` → `{ items, next_cursor }`, returns an empty page on failure. `GET /api/news` thin proxy for client-side pagination/toggle (documented in `/docs/api-surface.md`).
- [x] `/dashboard/news` — server `page.tsx` (fetches first global page + resolves the user's holding symbols), `NewsFeedClient.tsx` (All markets / My holdings toggle, cursor "Load more", honest empty states), `page.module.css`. Shared `NewsList` + `NewsList.module.css` in `dashboard-charts/` (sentiment dot, source, relative time, links out). "News" added to `AppHeader` nav + `isNavActive`; `MobileTabBar`'s disabled "Profile" tab swapped for "News".
- [x] "Recent news" card on `/dashboard/stock/[ticker]` — `getNews({symbols:[ticker], limit:6})` in the server component, rendered via `NewsList` (only when items exist).
- [x] Built against the design system + `--app-*` tokens; sentiment dot uses `--app-gain` / `--app-text-subtle` / `--app-loss`, page intro + dot `title` label it "headline tone… not analysis, and not a signal". Verified live in selfhost mode (Playwright): global feed renders real items with dots/sources, TCS stock page shows a real 6-item news card.
- [x] `/api/news` thin proxy added (the feed does paginate client-side) — documented in `/docs/api-surface.md`.

**Cross-cutting:**
- [x] Works in both deployment modes — no `isHosted()` gating; `/api/news` is public, the holdings filter uses whatever `getCurrentUserId()` resolves.
- [x] `tsc` / `lint` / `next build` / `npm test` (78) green; fundamentals-api `pytest` 50/50. Live-verified end-to-end against a local Postgres (migration applied) + local fundamentals-api: `/news` global + `?symbols=` + cursor pagination all return real data; the two Next.js surfaces render correctly.
- [x] `/docs/architecture.md` "News feed" section added; `/docs/api-surface.md` gets a `GET /api/news` entry.
- [x] Deployed 2026-09-06: migration `31f04c1b3507` applied to prod Neon (`alembic current` → head); fundamentals-api redeployed — prod `/news` verified serving real data (global + `?symbols=RELIANCE` + cursor). marketmitra-v2 redeployed — prod `/api/news` proxy verified; landing/`/api/search`/`/sign-in` regression-clean. `/dashboard/news` (and every `/dashboard/*`) returns 404 to bare `curl` — that's Clerk's dev-instance `protect-rewrite` for non-browser clients, identical to `/dashboard/portfolio`, not a regression; a real signed-in browser is needed to see the page render in prod.
- [x] Confirmed as done by the user 2026-09-06 (eyeballed signed-in in the Phase 4–8 prod verification pass); archiving protocol run — detail moved to [`/docs/archive/news-feed.md`](./docs/archive/news-feed.md).

**Explicitly out of v1 scope** (ADR 0015): notifications on news, LLM sentiment/summarisation, near-duplicate-story dedup across outlets, full article text / reader view, non-English news, user-configurable sources or per-source muting, per-user saved/read state.

## Phase 7 — IPO Tracker + GMP Alerts ✅
**Signed off 2026-09-06.** Full build detail archived to [`/docs/archive/ipo-tracker.md`](./docs/archive/ipo-tracker.md). Follow-ups (GH Actions refresh activation, one real IPO-alert fire) are under "Post-sign-off follow-ups" below.

Scoped 2026-09-06 — see [ADR 0017](./docs/decisions/0017-ipo-tracker-gmp-scope.md). v1 = IPO calendar + subscription + **GMP** (scraped from one aggregator, heavily caveated), ingested in `fundamentals-api` with lazy TTL refresh; alerts reuse Phase 5's engine (two new variants: a per-user `ipo_watch` subscription + per-IPO `ipo` alerts) with four triggers (opens / last day / allotment+listing / GMP threshold); a `/dashboard/ipos` page + a dashboard-home widget. The title's "nodemailer" is superseded by ADR 0014 — IPO alerts go through `deliverNotification` (in-app + webhook).

- [x] **GATE — ToS review:** Chittorgarh reviewed 2026-09-06 (terms prohibit content reuse without permission; site 403s bots). **User decision: accept the trade-off** on the same terms as Screener.in — isolated swappable module, GMP caveated + degrades to "unavailable", polite pacing. Recorded in `/docs/data-sources.md` + ADR 0017 amendment.

**Backend — fundamentals-api:**
- [x] Migration `2796fbd6805c` — `ipos` table (slug dedup, `status` indexed, category, 4 dates, price, `ipo_size_cr`, lot, rating, `subscription_times`, anchor, `gmp`/`gmp_pct`/`gmp_low`/`gmp_high`/`gmp_updated_at`, `source_tier`). `ipo_cache_ttl_minutes` (60) / `ipo_listed_retention_days` (10) / `ipo_ingest_token` in `config.py`. Applied locally.
- [x] `app/ingestion/tier3_ipo_scraper/` (scraper + README) — `_parse_ipo_rows(html, ref)` pure parser for InvestorGain's Live-IPO-GMP report table (`<td data-label>`), deriving slug / category / status / GMP+range / rating / sub / price / size / lot / 4 dates (IST year-inference) / anchor. **Verified against a maintainer-saved page: 23 real IPOs, all fields.** `nsepython` has no IPO helpers → Tier 1 is a future direct-call attempt; Tier 3 is the primary. `fetch_ipo_list()` is best-effort (the live page is a SPA — see the live-ingestion job item).
- [x] `app/services/ipo_service.py` — `get_ipos(session, status?)` reads Postgres (ordered open→upcoming→closed→listed) with lazy TTL refresh; `ingest_ipos(session, rows)` update-first upsert on slug (only creates a new row for an unseen slug) + prunes IPOs whose listing date is >10 days past. IST-aware dates.
- [x] `GET /ipos?status=` + `POST /ipos/ingest` (`ipo_ingest_token` bearer, 503 when unset) — registered in `main.py`. 13 offline tests (`tests/test_ipos.py`: parser field-by-field, `_parse_dmon` year-rollover, route shape, 422 on bad status, ingest 503). fundamentals-api suite 63/63, ruff clean. Verified live end-to-end against a local Postgres: ingest 23 → `get_ipos` status filters return correct sets.
- [x] Docs: service README ("IPO tracker" section + endpoint list + coverage row, test count 50→63), `/docs/data-sources.md` (Chittorgarh/InvestorGain entry with the ToS line), `tier3_ipo_scraper/README.md` (ToS position + out-of-band fetch rationale).

**Backend — main app (alerts reuse):**
- [x] Zod variants in `src/lib/alerts/schemas.ts` — `ipo_watch` + `ipo` added to the discriminated union + `paramsSchemaForType`. Types in `types.ts` (`IpoWatchParams`/`IpoAlertParams`/`IpoTrigger`/`IpoSnapshot`, `sentKeys` on `Alert`).
- [x] `store.ts` — `sentKeys` on the doc; `getIpoWatch(userId)` + `upsertIpoWatch(userId, params)` (one-per-user, resets `sentKeys` on edit); `applyAlertTransition` patch accepts `sentKeys`.
- [x] `src/lib/alerts/ipoAlerts.ts` — pure `istToday()` (IST), `evaluateIpoAlert(params, ipo, today)` (date triggers + gmp crossing, null on missing data), `evaluateIpoWatch(params, ipos, sentKeys, today)` (per-(slug,subkey) hits, mainboard filter, sentKeys prune). 15 table tests (`ipoAlerts.test.ts`).
- [x] `evaluateAlerts()` — one `getIpos()` per cycle (only when ipo alerts exist), `ipo_watch` branch (multi-notify + `sentKeys` write) and `ipo` branch (`decideAlertTransition` reused), per-type notification copy (`buildIpoWatchPayload`/`buildIpoAlertPayload`). `iposFetched` in the summary. `src/lib/dashboard/iposApi.ts` client added. Loop tests in `evaluate.test.ts` (+5).
- [x] `POST /api/alerts` special-cases `ipo_watch` → `upsertIpoWatch` (returns 200). New variants documented in `/docs/api-surface.md`. `tsc`/`lint`/`next build`/`npm test` (93) green.

**Frontend — Next.js:**
- [x] `src/lib/dashboard/iposApi.ts` client (pt.2). No `/api/ipos` proxy — the page is a Server-Component read; expand/alert actions hit `/api/alerts` directly.
- [x] `/dashboard/ipos` — `page.tsx` (server; reads the user's `ipo_watch`), `IposPageClient` (Open now / Upcoming / Recently closed-listed sections + "Notify me about IPOs" panel → `ipo_watch` upsert), `IpoRow` (collapsed = name + Mainboard/SME + status + GMP + dates; expand = price/lot/size/sub/allotment/listing/anchor/GMP-range + the "unofficial grey-market estimate" caveat + Source link + inline "Set alert" → per-IPO `ipo`), `page.module.css`. "IPOs" in `AppHeader` nav; not in `MobileTabBar`. **Verified live** (selfhost).
- [x] `IpoOpenCard` (`dashboard-charts/`) on `/dashboard` home — compact open-IPO list + "All IPOs →"; `dashboard/page.tsx` fetches `getIpos('open')`.
- [x] Built against the design system + `--app-*` tokens (card/pill/link patterns from the alerts + news pages).

**Ingestion job (out of band):**
- [x] `services/fundamentals-api/scripts/refresh_ipos.py` — renders the InvestorGain report with Playwright Chromium, runs `_parse_ipo_rows`, POSTs to `/ipos/ingest` (JSON boundary → `_coerce` turns ISO date strings back to `date`/`datetime`). `--dry-run` for local. `.github/workflows/refresh-ipos.yml` — every ~2h (03:00–15:00 UTC) + `workflow_dispatch`; installs `playwright`+chromium; `FUNDAMENTALS_API_URL` var + `IPO_INGEST_TOKEN` secret. **Activate:** `gh secret set IPO_INGEST_TOKEN` + set the same as `IPO_INGEST_TOKEN` on the fundamentals-api Vercel project + make this the default branch. Ingest path verified locally end-to-end (401 without token, upsert-no-dupes with it, ISO dates round-trip); the Playwright render step still needs one CI run to validate. 4 tests (`_coerce`, token matrix); fundamentals-api suite 67/67.

**Cross-cutting:**
- [x] No `isHosted()` gating (IPO data is public). Works in both modes.
- [x] `tsc` / `lint` / `next build` / `npm test` (93) green; fundamentals-api `pytest` (67) green. Live-verified: `/ipos` + status filters return real data, the page + expand + dashboard widget render (selfhost), `ipo`/`ipo_watch` alerts round-trip, cron `?force=1` fetches `/ipos`. Still to prove in prod: one IPO alert firing on an actual trigger day.
- [x] `/docs/architecture.md` "IPO tracker + GMP" section added.
- [x] **Deployed 2026-09-06:** prod Neon migrated (`2796fbd6805c`); `IPO_INGEST_TOKEN` set on `marketmitra-fundamentals-api`; both projects redeployed; `scripts/refresh_ipos.py` run once against prod (Playwright render validated) → seeded **39 real IPOs** (1 open, 17 upcoming, 8 closed, 13 listed). Prod `/ipos` + `/ipos?status=` serve live data; `/ipos/ingest` 401s without the token. Regression-clean (landing 200, `/api/search`).
- [→] Activate the GH Actions refresh (secret `IPO_INGEST_TOKEN` + default branch) — see "Post-sign-off follow-ups" below.
- [→] Watch one real IPO alert fire on an actual trigger day — see "Post-sign-off follow-ups" below.
- [x] Confirmed as done by the user 2026-09-06; archiving protocol run — detail moved to [`/docs/archive/ipo-tracker.md`](./docs/archive/ipo-tracker.md).

**Explicitly out of v1 scope** (ADR 0017): GMP history/charts, buybacks/rights issues/NFOs, broker- or category-wise subscription breakdown, "apply via broker" links, email delivery, a second GMP source / cross-checking.

## Phase 8 — AI Insights (stock / portfolio / IPO / Mitra chat) ✅
**Signed off 2026-09-06.** Full build detail archived to [`/docs/archive/ai-insights.md`](./docs/archive/ai-insights.md) (incl. the two post-deploy fixes: retired Gemini model, and the `getAiConfig` cold-start bug fix arc). Follow-ups (DRHP grounding, scripted-tile replacement) are under "Post-sign-off follow-ups" below.

Scoped 2026-09-06 — see [ADR 0018](./docs/decisions/0018-ai-insights-scope.md). v1 = AI SDK v6 with three BYO provider adapters (Gemini / Anthropic / OpenRouter), a `/dashboard/settings` page storing the user's key AES-256-GCM-encrypted in Mongo (env fallback for self-host), insight cards on the stock / portfolio / IPO surfaces (per-user cache for stock+portfolio, cross-user shared for IPO), and the "Mitra" widget wired to a real streamed chat. Hard guardrail: neutral synthesis only — no buy/sell/hold, no price targets, every insight ends "…not investment advice." Trial-limit counting is moot (no paid tier).

**Foundation (part 1):**
- [x] Deps: `ai`@7 + `@ai-sdk/google`@4 + `@ai-sdk/anthropic`@4 + `@openrouter/ai-sdk-provider`@3. `src/lib/ai/` — `providers.ts` (`resolveModel({provider,apiKey,model})`, `DEFAULT_MODELS`/`PROVIDER_LABELS`), `generate.ts` (`generateInsightText` + `validateAiKey` — never throw, `normalizeAiError` maps bad-key/quota/model errors), `prompts.ts` (`GUARDRAIL` + per-surface system prompts). 3 tests (`providers.test.ts`).
- [x] `src/lib/crypto.ts` — AES-256-GCM `encrypt`/`decrypt` (iv.ct.tag base64url), `isEncKeyConfigured`, 5 tests (round-trip, random IV, tamper-reject, missing/short key). `src/lib/userSettings.ts` — `userSettings` collection, `getAiSettings` (decrypts) / `getAiSettingsView` (key hint only) / `setAiSettings` (encrypts, upsert) / `clearAiSettings`. `src/lib/ai/userAiConfig.ts` — `getAiConfig(userId, {allowEnv})` → stored ▸ env ▸ null (`allowEnv:false` for per-user insights).
- [x] `/dashboard/settings` (`page.tsx` + `SettingsClient` + `page.module.css`) — provider select w/ per-provider key hints, password key input, optional model, "Test & save" (calls `validateAiKey`), "Remove key", a warning when `SETTINGS_ENC_KEY` is absent, a "Connected · key ends ••••xxxx" row. `GET/PUT/DELETE /api/settings/ai` (Zod, session-scoped; PUT 503s without `SETTINGS_ENC_KEY`, 400 on a rejected key). ⚙ link in the `AppHeader` actions. `.env.local.example` gains `SETTINGS_ENC_KEY` + `AI_PROVIDER`/`AI_API_KEY`/`AI_MODEL`. `tsc`/`lint`/`next build`/`npm test` (101) green; page renders live (selfhost, no-enc-key warning path).

**Insights (parts 2–4):**
- [x] `src/lib/insights.ts` — `hashInput` (stable canonical-JSON sha256), `getCachedInsight` (read-only, for SSR), `getOrGenerate({scope,key,userId,inputHash,ttlMs,generate,force})` over the `insights` Mongo collection (fresh = hash-match + within TTL; else regenerate + upsert; a generate error doesn't write). `src/lib/ai/insightPrompts.ts` — pure `buildStockPrompt`/`buildPortfolioPrompt`/`buildIpoPrompt`. 8 tests (`insights.test.ts`).
- [x] `POST /api/insights/stock {symbol,force?}` — `getAiConfig(userId,{allowEnv:false})` (no env), 400 `no_ai_key` when null; assembles company/ratios/P&L(last 2 periods)/shareholding/1mo-close/news snapshot; per-user cache `(userId, symbol)` 24h. `<InsightCard label="AI read">` on `/dashboard/stock/[ticker]` (SSR passes cached + hasKey).
- [x] `POST /api/insights/portfolio {force?}` — same key rules; input = enriched holdings (name/sector/qty/avg/ltp), per-user cache `(userId,'portfolio')` 6h, 400 when no holdings. `<InsightCard label="Portfolio insight">` under the analysis heading.
- [x] `POST /api/insights/ipo {slug,force?}` — `getAiConfig(userId,{allowEnv:true})` (operator key allowed), **shared** cache `userId:null` keyed by slug, 12h; input = the IPO row (DRHP text is pt.4, passed null). `<InsightCard label="IPO brief">` in the expanded `IpoRow` (lazy — `initial:null`). `aiKeyAvailable` threaded page → client → row.
- [→] **DRHP grounding (best-effort, trimmable) — DEFERRED.** The wired GMP source (InvestorGain's "Live IPO GMP" report) carries **zero DRHP links** — confirmed by grep against the saved page. Populating `ipos.drhp_url` would need a second per-IPO SPA scrape (or a SEBI filing-list scrape) — a new fragile job, out of proportion to a feature ADR 0018 marks "best-effort". The IPO brief already runs cleanly without it (`drhpExtract: null`). **Moved to "Post-sign-off follow-ups" below**; `GET /ipos/{slug}/drhp-extract` + `pdfplumber` come with it.

**Mitra chat (part 5):**
- [x] **pt.5:** `POST /api/ai/chat` — streamed (`streamText` → `toTextStreamResponse()`), context = portfolio summary + per-holding P&L + merged recent news (`src/lib/ai/chatContext.ts`, pure + tested), `CHAT_SYSTEM` guardrail ("use only the context", declines advice). `getUserAiConfig` (user key; env only in self-host — never the hosted operator key). `AiWidget.tsx` rewired: `AI_REPLIES` deleted, `send()` streams token-by-token into the last message, a "Mitra needs your AI provider key → Settings" hint when `GET /api/settings/ai` reports none. The scripted section-keyed "Proactive insight" tiles (`INSIGHTS`) stay — a separate concept demo, Phase 9+ follow-up. 5 tests (`chatContext.test.ts`).

**Cross-cutting:**
- [x] Works in both modes — per-user surfaces (stock / portfolio / chat) use `getUserAiConfig` = user's own key, plus the `AI_*` env key **only** when `!isHosted()` (single local user); IPO briefs keep `allowEnv:true`. `tsc`/`lint`/`next build`/`npm test` (114) green.
- [x] `/docs/architecture.md` + `/docs/api-surface.md` updated. Deployed to prod 2026-09-06 — `SETTINGS_ENC_KEY` set on `marketmitra-v2` (Secret), `vercel deploy --prod`; landing 200, /api/ai/chat + /api/insights/* register (401 unauth).
- [x] **Post-deploy fixes (2026-09-06):** (1) default Gemini model `gemini-2.5-flash` → `gemini-3.6-flash` — Google 404s the old id for newly-created AI Studio keys; `normalizeAiError` now surfaces the provider's own error text; `MAX_OUTPUT_TOKENS` 700→2048 (`adc8301`, `ade642b`). (2) **`getAiConfig` cold-start bug** — a blanket `.catch(() => null)` read a cold-serverless Mongo timeout as "user has no key", SSR'ing "Add your AI provider key" on the first render of stock/IPO insight surfaces. Fixed with retry-with-backoff in `getAiConfig` + a new `resolveHasAiKey()` that degrades a persistent DB error to the optimistic "Generate" affordance (never a false "add key", never a page 500). New `userAiConfig.test.ts` (12 cases), 131 tests green. Prod-verified signed-in across HDFCBANK/LT/BAJFINANCE/MARUTI + IPO row + portfolio (`ffd3225`→`09fd986`→`ee8d443`, deploy `20j4l0hh9`).
- [x] Confirmed as done by the user 2026-09-06; archiving protocol run — detail moved to [`/docs/archive/ai-insights.md`](./docs/archive/ai-insights.md).

---

## Post-sign-off follow-ups (Phases 4–8, not blocking anything)

Carried past sign-off 2026-09-06. Each is small and independent; none gates Phase 9.

- [x] **Phase 4 — Tier 1 filing-URL discovery.** Done 2026-09-06. `app/ingestion/filing_discovery.py`
  discovers the latest NSE/BSE results filing (NSE financial-results API → BSE announcements
  fallback), `xbrl_parser` / `pdf_financials` extract it as the newest period, and it's wired
  into `fundamentals_service.get_financial_statement` ahead of the Screener scrape (Screener
  still fills history + is the fallback). `financials_tier1_enabled` flag. `tests/test_filing_discovery.py`
  (13). fundamentals-api suite **86 passed**, ruff clean. NSE fetch unverified from a blocked
  env — fails safe to Tier 3, no regression. *Follow-up: verify the NSE/BSE parsers against
  real live responses and correct the field maps; multi-period XBRL context extraction.*
- [x] **Phase 5 — ~10-min alert scheduler activated** 2026-09-06. `CRON_SECRET` rotated (fresh value in the GitHub repo secret + `marketmitra-v2` prod env, redeployed). `evaluate-alerts.yml` `workflow_dispatch` run → success; `POST /api/cron/evaluate-alerts?force=1` with the new token → `200 {ran:true,...}`, wrong token → `401`. `schedule:` fires from `main` (now the default branch).
- [x] **Phase 5 — email delivery.** `sendEmail()` wired against the `resend` SDK
  (`src/lib/notifications/channels.ts`, `renderEmail()` template, 6 tests). `RESEND_API_KEY`
  set on `marketmitra-v2` production + deployed 2026-09-06 — email delivery is **live**.
  ADR 0014 amendment. **Remaining caveat:** sender is the default `onboarding@resend.dev`,
  which only delivers to the Resend account owner's own address; reaching arbitrary
  recipients needs a verified domain in `ALERT_EMAIL_FROM`.
- [ ] **Phase 5 — verify one real alert fires end-to-end** during NSE market hours (create an alert near the current price, hit the cron route, confirm the notification).
- [x] **Phase 7 — IPO refresh workflow activated + validated** 2026-09-06. `IPO_INGEST_TOKEN` rotated (GitHub repo secret + `marketmitra-fundamentals-api` prod env, redeployed). `refresh-ipos.yml` `workflow_dispatch` run → success: Playwright rendered the InvestorGain SPA, **parsed 40 IPO rows, ingested 40** via the authenticated `/ipos/ingest` (`{ingested:40}`) — the never-CI-tested render step now proven. Runs every ~2h from `main`.
- [ ] **Phase 7 — watch one real IPO alert fire** on an actual trigger day.
- [ ] **Phase 8 — DRHP grounding for the IPO brief.** The wired GMP source carries zero DRHP
  links; needs a separate per-IPO SPA scrape or a SEBI filing-list scrape. Carries
  `GET /ipos/{slug}/drhp-extract` + `pdfplumber` with it. The brief runs fine without it.
- [ ] **Phase 8 — replace the scripted "Proactive insight" chat tiles** (`aiWidgetContent.ts`
  `INSIGHTS`) with real generated content — they currently show fictional company names /
  numbers, which reads as real analysis.
- [ ] **Cosmetic — stock price-history chart x-axis** renders repeated month labels
  ("Sept Sept Aug Aug Aug…").

---

## Phase 9 — API Surface: MCP server + rate limiting + API explorer ✅
**Signed off 2026-09-06.** All three parts built, deployed, and prod-verified (MCP `/api/mcp`; Upstash rate limiting live on both services; explorer `/dashboard/api`). Full build detail archived to [`/docs/archive/api-surface.md`](./docs/archive/api-surface.md); `/docs/architecture.md` holds the summary. Remaining follow-ups (scheduler activation, Resend, real fire tests, DRHP) are under "Post-sign-off follow-ups" above.

Scoped 2026-09-06 — see [ADR 0019](./docs/decisions/0019-phase-9-api-surface-mcp-rate-limiting.md). Three deliverables, buildable largely in parallel: (1) a **full MCP server** exposing the read-only public data as agent tools (supersedes the original "JSON/Markdown response modes"), (2) **Upstash Redis** (Vercel Marketplace) sliding-window **rate limiting** on `/api/*` + the fundamentals-api public endpoints + the MCP server, (3) a **hosted interactive API explorer** page. Per-user MCP tools, API keys, and monetized tiers are explicitly out of v1.

**Part 1 — MCP server:** ✅ built + deployed 2026-09-06.
- [x] Spike resolved → a route in the Next app, `src/app/api/mcp/route.ts` via `mcp-handler`@2 (+ `@modelcontextprotocol/server`@2). Not a standalone service — the tools wrap `src/lib/dashboard/*` which already calls fundamentals-api, so standalone would just add a hop. ADR 0019 §1 updated.
- [x] 7 tools in `src/lib/mcp/tools.ts` (`search_symbols`, `get_quote`, `get_company_fundamentals` w/ optional `sections`, `get_price_history`, `get_news`, `list_ipos`, `get_market_indices`) — zod input schemas, plain-object `run()` results wrapped by `src/lib/mcp/server.ts` into `CallToolResult` (JSON text + `structuredContent`).
- [x] Unauthenticated (public data only). Every data-touching result carries a "not investment advice" / "headline tone not a signal" / "unofficial GMP estimate" note. Rate limiting is Part 2.
- [x] `/api/mcp` **live in prod** (deploy `hqgdf1gal`, 2026-09-06) — `initialize` / `tools/list` / `tools/call get_market_indices` verified against prod fundamentals-api.
- [x] `public/llms.txt` — points agents at `/api/mcp` + `docs/api-surface.md`, lists the tools.
- [x] `src/lib/mcp/tools.test.ts` — 17 cases (registry shape, per-tool schema rejection + `run` behaviour against a mocked data layer). Live smoke-tested against `next dev` + local fundamentals-api: `initialize`, `tools/list` (all 7 with JSON Schema), `tools/call get_market_indices` (real NIFTY/SENSEX), schema rejection → `isError`.
- [x] `/docs/api-surface.md` — new "MCP server — `/api/mcp`" section + tool table. `/docs/architecture.md` gets its section under Cross-cutting below.

**Part 2 — rate limiting:** ✅ built + **live in prod** 2026-09-06. Upstash store `marketmitra-ratelimit` (Free, primary region `iad1`) connected to both Vercel projects; code reads the integration's `KV_REST_API_*` names (`17c4fac`); both redeployed. Verified: `marketmitra-v2` 429s after 30 anon req/min with `RateLimit-*` headers; `fundamentals-api` counts `/indices`, exempts `/health`.
- [~] Provision Upstash Redis: `vercel integration add upstash/upstash-kv` (discovered via the `marketplace` skill — it's `upstash/upstash-kv`, "Upstash for Redis"). **Interactive (plan/name prompts) → left for the user to run**, then `vercel env pull`. Injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
- [x] `src/lib/rateLimit.ts` — `@upstash/ratelimit` sliding window, key by Clerk `userId` else first `x-forwarded-for` hop. `checkRateLimit(req, tier, {userId?})` + `withRateLimit(handler, tier)` + `rateLimitResponse` / `rateLimitHeaders`. Fails **open** if the limiter throws.
- [x] Wired: `src/proxy.ts` middleware rate-limits `/api/(.*)` at tier `default` (hosted only), excluding `/api/mcp*`, `/api/insights*`, `/api/ai*`, `/api/cron*`. `/api/mcp` route → `withRateLimit(handler, 'mcp')`. The 4 AI routes (`insights/{stock,portfolio,ipo}`, `ai/chat`) → `withRateLimit(handlePOST, 'ai')` — each expensive route governed by exactly one limiter.
- [x] Equivalent check in `services/fundamentals-api` — `app/rate_limit.py` + an `@app.middleware("http")` in `main.py`: fixed-window per client IP via the Upstash REST API (`httpx`, no `redis` dep), `/health` exempt, fails open, no-op without the Upstash env vars. `RATE_LIMIT_PER_MINUTE` default 120. `tests/test_rate_limit.py` (6) — suite **79 passed** (was 73), ruff clean. Its URL is public + documented, so this closes the direct-access bypass of the Next front door.
- [x] Tiers (starting budgets in `rateLimit.ts`, tuned later): `default` authed 120/min · anon 30/min; `ai` authed 15/min · anon 6/min; `mcp` authed 120/min · anon 60/min.
- [x] `429` = `{ success:false, data:null, error }` + `Retry-After` + `RateLimit-Limit/Remaining/Reset`.
- [x] Self-host: absent Upstash env → `rateLimitEnabled=false`, everything passes. `.env.local.example` + README updated.
- [x] ADR 0016 cross-reference added (see ADR 0019 §2).
- [x] Tests: `src/lib/rateLimit.test.ts` — 7 cases (disabled pass-through, IP vs user keying, authed budget, 429 + Retry-After, RateLimit-* headers on success, fail-open). Suite **155 passed**.

**Part 3 — interactive API explorer:** ✅ built + deployed 2026-09-06.
- [x] `public/openapi.json` — hand-kept OpenAPI 3.1 covering all 15 `/api/*` operations (+ tags, security schemes, request-body examples). Served at `/openapi.json`. `src/app/dashboard/api/openapi.test.ts` (3 cases) is the CI check: every documented path ↔ a `route.ts`, every documented method exported, no undocumented route.
- [x] `/dashboard/api` — `page.tsx` (server, reads `openapi.json` + the MCP tool list) + `ApiExplorerClient.tsx` (endpoint list grouped by tag, method chips, per-endpoint panel: path/query param inputs, JSON request-body textarea prefilled from the spec example, "Send" against the real deployment with `credentials: 'include'`, pretty response + status + timing + `RateLimit-*` readout, "Copy as curl") + `page.module.css`. No secret entry.
- [x] MCP server card at the top — connection URL (absolute, set after mount to avoid a hydration mismatch), the `{ "url": … }` config block, and the 7-tool list.
- [x] Built against `/docs/design-system.md` + `--app-*` tokens. "API" added to the `AppHeader` nav. Live-verified in selfhost: `GET /api/search?q=tcs` → 200 with the real TCS row, timing shown.

**Cross-cutting:**
- [x] Both deployment modes — self-host: no Upstash → `rateLimitEnabled=false`, MCP + explorer unaffected; the explorer's authed endpoints just resolve to the `local` user.
- [x] `tsc` / `lint` / `next build` / `npm test` (158) green. fundamentals-api `pytest` unaffected (no Python changed).
- [x] `/docs/architecture.md` "MCP server" section added; `/docs/api-surface.md` MCP section + `public/openapi.json`. `/docs/data-sources.md` — no new external source (Upstash is infra, not a data source).
- [x] **Prod deploy** — done 2026-09-06 (deploy `hqgdf1gal`). MCP + explorer + `/openapi.json` + `/llms.txt` live and verified. Rate limiting inert until the Upstash env vars are set (needs `vercel integration add upstash/upstash-kv` + a redeploy).
- [x] Activate rate limiting — done 2026-09-06. Upstash provisioned + connected to both projects, both redeployed (`chsaxkpoc` / `eo8vuc9qe`), 429-under-load verified on both services.
- [x] `services/fundamentals-api` own limiter — done 2026-09-06 (see Part 2). Needs the same Upstash env vars set on the `marketmitra-fundamentals-api` Vercel project + a redeploy to go live.
- [x] Confirmed as done by the user 2026-09-06 ("approved"); archiving protocol run — detail moved to [`/docs/archive/api-surface.md`](./docs/archive/api-surface.md).

## Phase 10 — AI chat + insights with retrieval (RAG) 🔄 scoped
Scoping session done 2026-09-06 → [ADR 0020](./docs/decisions/0020-phase-10-rag-chat.md). Decisions:
- **Corpus:** news archive + filings/fundamentals text + per-user portfolio & notes. Structured market data is *not* embedded — the chat model tool-calls the MCP layer for it instead (chat becomes agentic).
- **Store:** a `chunks` collection + Atlas Vector Search index (free-tier compatible). **Local embeddings** via `transformers.js` — no embedding API key, same path hosted + self-host. Indexing runs as a token-guarded cron (news + filings), never inline. PDF→text stays on the fundamentals-api (Python) side.
- **BYO-key** still required for *generation* only. Graceful fallback to today's prompt-stuffing when no vector index is available (non-Atlas self-host).
- **DRHP grounding** (deferred Phase 8 follow-up) is absorbed into Phase 10a's IPO-brief surface.
- **Scoping (resolved):** shared public corpus (`userId: null`, indexed once) + a strictly-filtered per-user private layer for holdings/notes/chat-history. Not full per-user duplication.
- **Surfaces (resolved):** split — **10a** = plumbing + chat + insight grounding; **10b** = a dedicated `/dashboard/research` page, follow-on phase.

### Phase 10a — retrieval plumbing + grounded chat & insights ✅ deployed + verified live

_Signed off, merged to `main`/`v2`, both projects deployed, RAG verified live on the hosted instance 2026-09-07 (150 news docs in the corpus, `errors: []`). Tests: 250 web / 100 api green. `index-corpus.yml` runs every 2h on its own. Awaiting the archiving-protocol pass. Filings-in-corpus is externally blocked (BSE 403s Vercel's IP) — works from an un-blocked host, documented like Tier 1._

- [x] **Embedding lib** — `src/lib/rag/embed.ts` wraps `@huggingface/transformers` v4 (auto-external in Next 16; the abandoned `@xenova/*` v2 rejected). Model **`Xenova/all-MiniLM-L6-v2`** (384-dim, ~23 MB `q8`), overridable via `RAG_EMBED_MODEL`; cache dir `RAG_MODEL_CACHE_DIR` (default `/tmp/...`), optional offline `RAG_LOCAL_MODEL_PATH`. Lazy singleton pipeline, `embedBatch` / `embedQuery`, mean-pool + normalize (cosine-ready). No key. 6 tests (mocked). _Note: `npm audit` flags high-sev transitive advisories in `adm-zip` (onnxruntime-node install-time unzip) and `sharp` (image path) — neither reachable from text-only embedding; no upstream fix yet, revisit on bump._
- [x] **Store + index** — `src/lib/rag/chunks.ts`: `ChunkDoc` (`source`/`chunkIndex` unique, `text`, `vector`, `docType`, `userId` null=shared, `symbol`, `sourceUrl`, `title`, `hash`, `publishedAt`, timestamps). `replaceSourceChunks()` (upsert-by-`(source,chunkIndex)` + prune trailing; byte-identical re-index writes nothing), `deleteSourceChunks` / `deleteUserChunks`, `chunkHash`. `ensureChunksIndexes()` — idempotent scalar indexes + `createSearchIndex` (`vectorSearch`, `dotProduct`, 384-dim, filter fields `userId`/`docType`/`symbol`); degrades to `vectorIndex: 'unavailable'` on non-Atlas. 10 tests. _(Index applied at runtime by the indexer cron — no separate script / tsx dep.)_
- [x] **Chunker** — `src/lib/rag/chunk.ts`: char-budget windows (default 2400/300 ≈ 600/75 tokens), sentence + paragraph boundary aware, overlap carry, tiny-tail merge bounded by the ceiling, CRLF/blank-run normalize. Pure, 8 tests.
- [x] **fundamentals-api: PDF→text endpoint** — `POST /documents/extract-text` (`app/api/routes/pdf_text.py`), guarded by the existing `ipo_ingest_token` (503 unconfigured / 401 bad). `app/ingestion/pdf_text.py`: download (48 MB cap, PDF sniff, 60 s timeout) → `extract_pages()` (lazy `import pdfplumber`, per-page text, optional `max_pages`) → `{url, bytes, page_count, pages[], text}`. `pdfplumber>=0.11` added to prod `requirements.txt` (pure Python; `camelot`/`opencv` still excluded) — [ADR 0013 amendment](./docs/decisions/0013-fundamentals-api-vercel-hosting.md). 7 pytest, ruff clean, suite 86→93.
- [x] **Corpus indexer (news)** — `POST /api/cron/index-corpus` (`maxDuration` 300, `CRON_SECRET` bearer, `?indexesOnly=1` = ensure-indexes-and-return for self-host setup, `?newsLimit=`). `src/lib/rag/indexer.ts`: `ensureChunksIndexes()` → `getNews()` → `indexTextDocument()` per item (chunk → `embedBatch` in 32s → `replaceSourceChunks` under `userId:null`, no-op on unchanged) → prune news chunks older than `newsRetentionDays` (45). Per-item errors collected, run still finishes. `MAX_WINDOWS_PER_DOC` 400. `.github/workflows/index-corpus.yml` (every 2 h, curl the route like `evaluate-alerts.yml`). `public/openapi.json` entry added. 7 tests.
- [x] **Corpus indexer (filings)** — `indexFilings()` in `indexer.ts`: per symbol (`RAG_FILING_SYMBOLS` or a 10-name Nifty default), `getDocuments()` → newest annual report → skip if `{source, publishedAt}` already indexed (immutable once filed, no re-fetch) → `fetchPdfText()` (`src/lib/rag/pdfTextClient.ts`, `IPO_INGEST_TOKEN` bearer, returns null on any failure) → `indexTextDocument(filing:<sym>:<url>, {docType:'filing',…}, text)`. `maxFilings` 3/run, `filingMaxPages` 120. Errors collected per filing. 10 tests (6 filings + pdfTextClient).
- [x] **Per-user corpus sync** — `src/lib/rag/userSync.ts`: `syncUserNote` / `removeUserNote` / `syncUserHoldings` — chunk + `embedBatch` + `replaceSourceChunks` under the caller's `userId` (`note:<id>`, `holdings:<userId>`). Every function swallows its errors and returns a boolean — a sync failure never fails the originating write. Called fire-and-forget (`void`) from the notes routes; `resyncUserHoldings(userId)` (fetch enriched holdings → `syncUserHoldings`) wired `void` into `POST /api/holdings` + `PATCH|DELETE /api/holdings/{id}`. 9 tests.
- [x] **`userNotes` collection + CRUD + panel** — `src/lib/notes/userNotes.ts` (`userNotes` collection: title/body/optional symbol, trim+truncate, 200/user cap) + `GET|POST /api/notes` + `PATCH|DELETE /api/notes/{id}` (owner-scoped, fire-and-forget corpus sync). `public/openapi.json` entries. `/dashboard/notes` page + `NotesPageClient` (list + inline create/edit/delete, design-system `page.module.css`) + `Notes` nav item in `AppHeader`. 8 tests.
- [x] **`chatMessages` collection** — `src/lib/chat/chatHistory.ts`: `appendTurn` (stores user+assistant, prunes past a 100/user rolling cap; never throws), `recentUserQuestions`, `clearHistory`. `streamChat` gained an `onFinish` hook; the chat route persists each completed turn and `void syncRecentChat(userId, recentUserQuestions())` re-embeds the user's recent questions as `chat:<userId>` (`docType: 'chat'`). `DELETE /api/ai/chat` clears history + drops the corpus entry. `public/openapi.json` updated. 7 tests. _(A "clear history" control in the chat widget: optional polish, not wired.)_
- [x] **Retrieval lib** — `src/lib/rag/retrieve.ts`: `retrieve({ query, userId, docTypes?, symbol?, limit?, numCandidates?, minScore? })` → `embedQuery` → `$vectorSearch` (index `chunks_vector`) + `vectorSearchScore` projection over `{ userId: {$in: [null, caller]} }` (+ `docType $in`, + `symbol $or null` under `$and`). `minScore` post-filter. Returns `null` — never throws — on embed failure / empty vector / aggregation error (non-Atlas, missing index). `buildRetrievalFilter` exported + unit-tested. 8 tests.
- [x] **Agentic chat** — `POST /api/ai/chat` reworked: `src/lib/ai/chatTools.ts` `buildChatTools(userId)` adapts all 7 `src/lib/mcp/tools.ts` entries to AI SDK `tool()` (thrown errors → `{error}`) **plus** `search_context` backed by `retrieve()` (returns `{available:false}` when the corpus is unreachable → model falls back to the data tools). `generate.ts` `streamChat` gains `{tools, maxSteps}` → `stopWhen: stepCountIs(5)`. New `CHAT_SYSTEM_AGENTIC` prompt (guardrail intact: no buy/sell/hold, "not investment advice"). `formatChatContext` kept as a small always-present portfolio seed; `maxDuration` 60→120. `toTextStreamResponse()` unchanged (tool steps internal). 5 tests.
- [x] **Grounded insights** — `src/lib/rag/insightContext.ts` `retrieveInsightGrounding()` (never throws; empty grounding when retrieval is unavailable → insight generates exactly as pre-Phase-10). Wired into all three routes: stock (`docTypes: news+filing`, symbol-scoped), portfolio (`news+note`, userId-scoped), IPO (`filing+news`, shared `userId:null`). `insightPrompts.ts` builders gain an optional `grounding` field rendered as a labelled block; the IPO builder uses grounding as the DRHP stand-in when `drhpExtract` is null. **Cache invalidation:** the retrieved passages are folded into the hashed `input`, so a re-index that changes retrieval regenerates the insight — no separate version marker. 9 tests. _(Full-DRHP-text grounding still waits on a DRHP-URL source for the indexer; the seam is now in place.)_
- [ ] **Deployment-mode / fallback** — RAG works in self-host on a stock Atlas cluster with no extra config; non-Atlas MongoDB → feature-detect fails → prompt-stuffing fallback, no error. Nothing here gates on `isHosted()`.
- [x] **Cross-cutting (docs + verification)** — `tsc` / `lint` / `next build` / `npm test` **247 green**; fundamentals-api `pytest` **93 green** (+7 for `test_pdf_text.py`). `docs/architecture.md` ("Retrieval (RAG)" section), `docs/api-surface.md` (`/api/notes*`, `DELETE /api/ai/chat`, `/api/cron/index-corpus`, revised `POST /api/ai/chat`), `docs/data-sources.md` (HF model as a bundled dep, not a runtime source), ADR 0020 status all updated. Every surface marked "on `phase-10-rag`, not in prod".
- [x] **Prod deploy + merge** — done 2026-09-06. `phase-10-rag` → `main`/`v2` (fast-forward), `marketmitra-v2` (`jqcq5wnm8`) + `marketmitra-fundamentals-api` (`666bnvlsb`) deployed. No regressions (`/` 200, embed-importing routes 401 not 500, fundamentals `/health` + `/indices` + `/documents/extract-text` all good). Also fixed en route: 2 stray NUL bytes in `chunkHash` (`903b3e0`), lazy-import of `@huggingface/transformers` (`4fa2664`).
- [x] **Embedding service (resolved the hosted-RAG blocker)** — `onnxruntime-node` can't load in Vercel's Node runtime and the WASM-backend path turned out to be a multi-hour bundler spike, so embeddings moved to **`services/fundamentals-api` `POST /embed`** (`fastembed`, `BAAI/bge-small-en-v1.5`, 384-dim, L2-normalised, `IPO_INGEST_TOKEN` bearer; `app/ingestion/embeddings.py` + `app/api/routes/embed.py`, 7 pytest). `src/lib/rag/embed.ts` is now an HTTP client to it (throws on failure → callers already fall back); `@huggingface/transformers` removed from the Next app (also cleared its `adm-zip`/`sharp` advisories). Same path hosted + self-host (self-host runs both services). Model (~64 MB) downloads to `/tmp` once per function instance. 249 web / 100 api tests green. Docs updated (`architecture.md`, `data-sources.md`).
- [x] **Bootstrap + verify** — Atlas Vector Search index created (`vectorIndex: created` → now `exists`), first full indexer run done: **`news: { seen: 150, changed: 150 }`, `errors: []`** — the fastembed `/embed` path works end-to-end in prod. `CRON_SECRET` + `IPO_INGEST_TOKEN` already repo secrets → `index-corpus.yml` fires every 2h from `main`. Fixed en route: news pagination past the `/news` 50-cap (`281691e`); `HF_HOME`→`/tmp` for the read-only Vercel `$HOME` (`79fa0d7`).
- [x] **Phase 10a archiving protocol** — `docs/archive/rag-chat.md` written (full build detail + the onnxruntime saga); `architecture.md` "Retrieval (RAG)" section collapsed to a summary + link, status header → "Phases 0–10a"; `CLAUDE.md` Current phase / Active focus updated (next = Phase 10b or 11). `session-log.md` at 12 entries — under the rollup threshold, left as-is. `decisions/` / `data-sources.md` / `api-surface.md` not pruned (living reference).
- [x] **README self-host note** — "Retrieval / RAG" section in README.md (reachable `FUNDAMENTALS_API_URL`, shared `IPO_INGEST_TOKEN`, the two `index-corpus` bootstrap curls, graceful-fallback note); `.env.local.example` gains `IPO_INGEST_TOKEN` + the `CRON_SECRET`-also-guards-`index-corpus` note.
- [x] **"Clear" control in `AiWidget`** — header button (shown when the transcript is non-empty) → `DELETE /api/ai/chat` (wipes server history + the `chat:<userId>` corpus entry) + clears local state. Best-effort.
- [ ] **Follow-ups (non-blocking):** pre-bundle the `bge-small` embedding model to kill the ~18s cold-instance download; filings-in-corpus needs an un-blocked PDF host (or a DRHP-URL source).

### Phase 10b — dedicated research surface ✅ deployed 2026-09-07

Scoped in the [ADR 0020 amendment](./docs/decisions/0020-phase-10-rag-chat.md#amendment-2026-09-07-phase-10b-scoped); built on `phase-10b-research`, reviewed, merged to `main`/`v2`, `marketmitra-v2` deployed (`65h11tfyh`). Full detail in [`docs/archive/rag-chat.md`](./docs/archive/rag-chat.md#phase-10b--the-research-surface).

A **structured brief** (fixed markdown sections), **retrieval + synthesis only** (no agentic loop — that's Phase 11), **ephemeral** (not stored). Subjects: company / theme / portfolio / comparison. `POST /api/research` (BYO key, `ai` tier, no cache) + `/dashboard/research` (`ResearchPageClient`, `MarkdownLite` renderer). 272 web tests green at ship.

## Phase 11 — Multi-agent analytical briefings ✅ deployed

Scoped 2026-09-07 → [ADR 0021](./docs/decisions/0021-phase-11-multi-agent-analysis.md) (accepted; runtime = **TS in the Next app**). Port the **analytical half** of TauricResearch/TradingAgents (Apache-2.0) — analyst team → bull/bear **debate** → synthesis — **as our own code, not a dependency**, and **stop before any trade decision** (no trader / risk-manager / position / simulated execution — the guardrail forbids it). Output: a debated briefing that may state which side of the debate is better-evidenced (a "direction"), never a recommendation/target, still ends "not investment advice." Full **reflection loop** in v1. Subject = one **stock** only (theme/portfolio/comparison stay Phase 10b's shallow tier).

### Part A — the pipeline (`src/lib/agents/`)
- [x] `AGENT_*_SYSTEM` prompts (`src/lib/agents/prompts.ts`) — 4 analyst roles + bull/bear/synthesis/claims/reflect, each `withGuardrail`; synthesis spells out the direction boundary.
- [x] `src/lib/agents/context.ts` `gatherAnalystContext()` — 4 slices (fundamentals / news+sentiment+retrieval / technical / macro) from the existing clients, each with `hadData`. `src/lib/agents/indicators.ts` — SMA/EMA/RSI/drawdown/MA-cross + `summariseTechnicals()`. 18 tests.
- [x] `orchestrator.ts` `runDebateRound()` — bull then bear (bear sees the fresh bull turn + all prior). `DEBATE_ROUNDS = 2`.
- [x] `orchestrator.ts` `runSynthesis()` (the briefing) + `extractKeyClaims()` (best-effort JSON, 2–4 claims for reflection). 8 orchestrator tests.
- [x] `src/lib/agents/tradeActionCheck.ts` `scanForTradeActions()` (regex; 9 tests). `runSynthesis` regenerates once on a hit.

### Part B — async, checkpointed runs
- [x] `src/lib/agents/store.ts` — `agentRuns` collection (the doc IS the checkpoint): create/get/patch, `claimNextRun` (atomic, advisory lock + stale-lock recovery), `userHasActiveRun`, `ensureAgentRunsIndexes`, and the Part-C queries.
- [x] `POST /api/agents/run` — auth, `getUserAiConfig` (400 `no_ai_key`), `ai` tier, one-in-flight (409), symbol check (502), `priceAtRun` capture → `createRun` → `after()` kicks the tick → 202 `{ id }`.
- [x] `POST /api/agents/tick` — `CRON_SECRET` bearer, `claimNextRun`, `advanceRun` (one phase), `after()` re-invoke until done. `maxDuration` 120. `src/lib/agents/runner.ts` `advanceRun()` + 9 tests.
- [x] `GET /api/agents/run/[id]` — owner-scoped poll → `toView`.
- [x] `.github/workflows/agents-tick.yml` — every 5 min, sweeps the oldest stuck run.
- [x] `/dashboard/agents` — `AgentsPageClient` (symbol input + cost note → phase indicator polling `GET run/[id]` every 4 s → `MarkdownLite` briefing). "Agents" nav item. No run list.

### Part C — reflection loop
- [x] `POST /api/cron/agents-reflect` + `.github/workflows/agents-reflect.yml` (daily) — `src/lib/agents/reflect.ts` `reflectOnRun()` (price move since the run → owner's model → hindsight lessons; never a verdict). Prunes runs > 120 d. 5 tests.
- [x] Injection — `src/lib/agents/lessons.ts` `buildLessonsContext()` (same-symbol then sector, ≤3 runs); the analysts phase resolves it into `doc.lessonsContext`, debate + synthesis pass it through. Prompts + `reflect.ts` carry the "calibration not prediction, short arbitrary window" caveat. 3 tests.

### Cross-cutting
- [x] 325 web tests / tsc / lint / `next build` green; `docs/architecture.md` + `docs/api-surface.md` + `public/openapi.json` entries. `CRON_SECRET` is already a repo secret → both new workflows fire from `main`. **Verified with a real live end-to-end run** (TCS, self-host, 2026-09-12). **Merged to `main`/`v2` and deployed to production 2026-09-12.** Full detail: [`/docs/archive/multi-agent-analysis.md`](./docs/archive/multi-agent-analysis.md).

_Out of scope: any trade decision / position / risk-manager / simulated execution; price targets or valuation verdicts; a LangGraph dependency (unless the open item flips); cross-user memory; streaming agent output; non-stock subjects; backtesting._

---

## Mitra navigation + file-based portfolio import ✅ built, merged, deployed

Scoped and built 2026-09-12 → [ADR 0022](./docs/decisions/0022-mitra-navigation-and-file-import.md). Two capabilities: page-aware navigation via LLM tool-calling, and file-based portfolio import (image/XLSX/CSV/DOCX/PDF → extract → match → mandatory preview → explicit confirm).

- [x] **Part A** — chat protocol migration to `@ai-sdk/react`'s `useChat` + `toUIMessageStreamResponse()`, zero behavior change, verified before anything else landed.
- [x] **Part B** — 4 navigation tools (`navigate_to_dashboard`, `navigate_to_portfolio`, `navigate_to_markets`, `open_stock`) + `PageContext` (mirrors `MaskContext`). Hard boundary: these + the 7 MCP tools + `search_context` are the *entire* ToolSet — no settings/security/billing/destructive-action tool exists, tested as an invariant. `open_document` dropped — no in-app document entity exists yet to point it at.
- [x] **Part C** — `src/lib/portfolio-import/`: deterministic XLSX/CSV (`exceljs`+`csv-parse`), AI-assisted image/PDF/DOCX (`unpdf`+`mammoth`+`generateObject`), fuzzy matching against `/search` (edit-distance + word-boundary prefix bonus).
- [x] **Part D** — `ImportPreviewCard` + `POST /api/portfolio-import/confirm` (the only route that writes; zero AI involvement). Nothing persisted between extract and confirm.
- [x] 355 web tests / tsc / lint / `next build` green throughout. **Verified live, not just unit-tested**: real navigation, the hard boundary holding under direct pressure, and a full CSV-upload-to-portfolio-write round trip (matched + ambiguous rows, one resolved, one excluded, confirmed via a fresh page load). Full detail in `docs/architecture.md`'s "Mitra navigation + file-based portfolio import" section (not yet archived) and the ADR.
- [x] Pushed to `main`/`v2` and deployed to production 2026-09-12. Post-deploy smoke test: new routes + `/api/ai/chat` return clean `401`s (not `500`s) unauthenticated.
- [ ] Archiving/pruning protocol deliberately not run yet — hold for explicit sign-off.

_Standing rule from this ADR: any future Mitra-driven portfolio edit must go through the same preview-then-explicit-confirm shape — this isn't scoped to import._

---

## Production-readiness pass (launch checklist) ✅ deployed

Run 2026-09-12 against a 20-item checklist (legal, security, SEO, performance, accessibility, reliability/UX) → [ADR 0023](./docs/decisions/0023-analytics-and-cookie-consent.md) for the analytics/cookie-consent decision.

- [x] **Legal:** `/privacy` + `/terms` pages, written for this app's actual hosted-vs-self-host behavior. **Needs the user's own lawyer review before being final — not a substitute for legal counsel.**
- [x] **Analytics + cookie notice** — `@vercel/analytics` (hosted-only, confirmed cookieless), `CookieNotice` disclosure bar (not a consent toggle — nothing non-essential to opt into). See ADR 0023.
- [x] **Security** — `NEXT_PUBLIC_` var audit + a grep of the actual built `.next/static` bundle (not just source) for leaked secrets: clean. HTTPS verified live on the prod domain (HSTS preload active, HTTP→HTTPS 308). README gained a self-host HTTPS-is-your-responsibility note.
- [x] **SEO** — per-route `generateMetadata`, `icon.tsx`/`apple-icon.tsx`, static + dynamic-per-stock OG images, `sitemap.ts`/`robots.ts`. Sitemap deliberately excludes auth-gated dashboard/stock routes.
- [x] **Accessibility** — WCAG AA contrast audit of the full token palette (8 tokens fixed), alt-text audit, and a real Lighthouse run against the production build for landing/dashboard/stock — caught and fixed a missing `<main>` landmark and a GitHub link with no accessible name at mobile widths. All three pages now score 1.0 on accessibility.
- [x] **Mobile pass** — landing, dashboard, portfolio, markets, stock, privacy, terms, 404 checked at 375px: no horizontal overflow anywhere. Found and fixed a real bug: Mitra's chat panel defaulted to open on every page load, covering dashboard content on narrow viewports.
- [x] **Reliability/UX** — custom `not-found.tsx`, footer link audit (removed every fabricated/`href="#"` link), form validation + spam-protection reviewed and concluded (both existing forms have real Zod server-side validation; no public form exists that needs Turnstile).
- [x] Full suite (typecheck/lint/test/build) green after all changes.
- [x] Pushed to `main`/`v2` and deployed to production 2026-09-12.

---

## Live-quote fix (yahoo-finance2 + NSE/BSE) + stock aggregate endpoint ✅ built, not yet deployed

Built 2026-09-12 → [ADR 0024](./docs/decisions/0024-live-quote-yahoo-finance2-and-stock-aggregate-endpoint.md). Two problems: dashboard/portfolio prices were stale, and the public API had no single "everything about this ticker" endpoint.

- [x] **Root cause found beyond the literal ask:** the dashboard UI never called the one real live-quote path at all — it derived "current price" from the latest end-of-day close. Fixing the quote source alone would not have fixed what the user was seeing.
- [x] `yahoo-finance2` (new, `src/lib/dashboard/yahooQuote.ts`) is now the primary live-quote source; NSE → BSE (fundamentals-api) is the fallback; yfinance removed entirely from this one path (ADR 0011's three-tier fundamentals-ingestion chain is unaffected).
- [x] Dashboard UI rewired to the real live quote: portfolio (`enrichedHoldings.ts`), home/markets movers (`dashboard/quotes.ts`), and the stock detail page header.
- [x] New `GET /api/stock/{ticker}` — screener.in-style aggregate (company, live quote, ratios, shareholding, peers, documents, financials), shared with the MCP `get_company_fundamentals` tool (which gains a `quote` field it never had). Documented in `public/openapi.json` + `docs/api-surface.md`, verified against the repo's own openapi↔routes CI check.
- [x] **Known, accepted limitation:** BSE fallback is a wired-in stub — no NSE-symbol→BSE-code mapping exists anywhere in this codebase yet, so it can't actually fire for any company today. Tracked here as separate future work, not silently assumed solved.
- [x] Verified live: a real `yahoo-finance2` call against the actual Yahoo Finance API returned accurate current prices for RELIANCE/TCS/NIFTY 50. Full suite green (TS: typecheck/lint/368 tests/build; Python: 102 tests + ruff).
- [ ] **Not yet pushed or deployed** — built on branch `live-quote-fix`, awaiting explicit go-ahead.
- [ ] **Future work, not blocking:** a real NSE-symbol→BSE-code mapping to make the BSE fallback stub actually fire; confirming live post-deploy whether NSE responds from the real Vercel environment (ADR 0011 only confirmed it's blocked in dev/CI).

---

## Deferred / Held Separately

- **Company legal issues / litigation tracking** — deferred, no data source decided, no ETA. Revisit only when explicitly raised again.
- **NautilusTrader** — not scheduled in any phase above. Requires its own dedicated conversation on scope (backtesting/research-only vs. live trade execution) before any code is written, given the regulatory/liability weight of the live-execution option. Do not fold this into any other phase's work without that conversation happening first.

---

## Standing rules that apply across every phase

- Stack: Next.js + TypeScript, CSS Modules only (no Tailwind/Bootstrap), MongoDB (unless Phase 4's storage discussion changes this for that service specifically), plus a `services/` directory for backend services like the fundamentals API.
- `DEPLOYMENT_MODE` gate governs all auth/billing code paths — self-host must remain free, full-featured, and BYOK for every phase, not just the ones built so far.
- Scraping (Scrapling/Screener.in or similar) never enters production code, in any phase — dev/test-only, if used at all.
- Any real architectural or product decision made while working a phase gets an ADR — don't let a decision live only in chat history.
