# API Surface

Documented public API endpoints, intended for both the human dashboard UI and AI agent consumers. This describes the system **as it currently stands** — updated per feature, never pruned or archived.

Every endpoint here is a Next.js App Router route handler under `app/api/**/route.ts` (see [ADR 0004](./decisions/0004-nextjs-api-routes-as-backend.md)). Auth is via Clerk session ([ADR 0005](./decisions/0005-clerk-auth.md)), or in hosted mode a personal access token (`Authorization: Bearer mm_pat_…`, [ADR 0053](./decisions/0053-personal-access-tokens.md)), unless marked public.

## Conventions

- Response envelope: `{ success: boolean, data: <payload> | null, error: string | null }`
- Paginated responses include `meta: { total, page, limit }`
- All endpoints validate input at the boundary and return 4xx with a clear `error` message on invalid input.

## Endpoints

### `GET /api/holdings`
- **Purpose:** List the current user's portfolio holdings (symbol, quantity, average price — no live price; the UI merges live quotes from `services/fundamentals-api` client-side/server-side, this endpoint is the stored-position source of truth only).
- **Auth:** required — Clerk session in hosted mode; a fixed `"local"` user id in self-host mode (ADR 0010's single-local-user placeholder). See `src/lib/currentUserId.ts`.
- **Request:** none.
- **Response:** `data`: `{ id, userId, symbol, quantity, avgPrice, createdAt, updatedAt }[]`.
- **Errors:** `401` if not authenticated.

### `POST /api/holdings`
- **Purpose:** Add a new holding.
- **Auth:** required (see above).
- **Request:** body `{ symbol: string, quantity: number > 0, avgPrice: number > 0 }`, validated with Zod.
- **Response:** `data`: the created holding, `201` on success.
- **Errors:** `401` unauthenticated, `422` on invalid input (message from the Zod error).

### `PATCH /api/holdings/[id]`
- **Purpose:** Update a holding's quantity/average price.
- **Auth:** required; only the owning user's holding can be updated (matched by `userId` + `_id`).
- **Request:** body `{ quantity: number > 0, avgPrice: number > 0 }`.
- **Response:** `data`: the updated holding.
- **Errors:** `401` unauthenticated, `404` if the holding doesn't exist or belongs to someone else, `422` on invalid input.

### `DELETE /api/holdings/[id]`
- **Purpose:** Remove a holding.
- **Auth:** required; scoped to the owning user, same as `PATCH`.
- **Request:** none.
- **Response:** `data: null` on success.
- **Errors:** `401` unauthenticated, `404` if not found/not owned.

### `GET /api/notes`  _(Phase 10a — on `phase-10-rag`, not yet in prod)_
- **Purpose:** List the current user's research notes (ADR 0020). Notes also feed the user's private retrieval corpus (`docType: 'note'`).
- **Auth:** required (Clerk session / `local` user).
- **Request:** none.
- **Response:** `data`: `{ id, userId, title, body, symbol: string|null, createdAt, updatedAt }[]`, newest-updated first.
- **Errors:** `401` unauthenticated.

### `POST /api/notes`  _(Phase 10a)_
- **Purpose:** Create a note; fires a best-effort corpus sync.
- **Request:** `{ title: string(1–140), body: string(1–4000), symbol?: string(≤30)|null }`.
- **Response:** `data`: the created note, `201`.
- **Errors:** `401`, `409` when the per-user cap (200) is reached, `422` on a bad body.

### `PATCH /api/notes/[id]`  _(Phase 10a)_
- **Purpose:** Update a note (owner-scoped); re-syncs it into the corpus.
- **Request:** `{ title, body, symbol? }` (same shape as `POST`).
- **Response:** `data`: the updated note.
- **Errors:** `401`, `404` not found / not owned, `422` bad body.

### `DELETE /api/notes/[id]`  _(Phase 10a)_
- **Purpose:** Delete a note; removes its corpus chunks.
- **Response:** `data`: `{ id }`.
- **Errors:** `401`, `404` not found / not owned.

### `GET /api/search`
- **Purpose:** Live search across every NSE-listed equity plus the tracked indices, for the Markets/header search-as-you-type UI.
- **Auth:** public — no session required.
- **Request:** query param `q` (required, min length 1).
- **Response:** `data`-less shape (returns the array directly, not the `{success,data,error}` envelope — see note below): `[{ type: "company" | "index", symbol, name }]`, capped at 15 results, index matches first.
- **Errors:** empty `q` returns `[]`.
- **Note:** this is a thin proxy to fundamentals-api's own `GET /search` (see ADR 0012's amendment) — a deliberate, narrow exception to the "consume fundamentals-api directly from Server Components" rule below, needed only because live-as-you-type search must run client-side and the browser needs a same-origin endpoint. It intentionally doesn't follow this file's usual response envelope convention since it's a pass-through of the Python service's own response shape.

### `GET /api/screener`
- **Purpose:** Filter the NSE stock universe by financial criteria (market cap, P/E, P/B, ROE, ROCE, dividend yield, debt/equity, 3y sales/profit growth CAGR, sector/industry) for `/screener`. See [ADR 0025](./decisions/0025-screener-bulk-ingestion-and-shared-filter-schema.md).
- **Auth:** public — no session required.
- **Request:** query params `<field>_min`/`<field>_max` for each numeric field above, plus `sector`, `industry` (equality), and `limit` (default 100, max 500). Fixed-field min/max + equality only — no free-form query expressions (deliberately deferred, see the ADR).
- **Response:** `data`-less shape (returns the array directly): `ScreenerMetric[]` — one row per matching company, sorted by market cap descending unless `sort_by` (any filterable field) / `order` (`asc`|`desc`) are given — sorted server-side over the whole matching set, NULLs last. Excludes companies whose last bulk scrape failed.
- **Errors:** `400` if any `_min`/`_max`/`limit` value isn't a valid number.
- **Note:** a thin proxy to fundamentals-api's `GET /screener`, backed by a table whose price-derived fields (market cap, price, P/E, P/B, dividend yield) refresh daily for the whole universe and whose fundamentals (ROE, ROCE, debt/equity, growth) are scraped incrementally, stalest first ([ADR 0033](./decisions/0033-screener-hybrid-refresh-and-ranked-search.md)) — not the same freshness as this stock's live detail page. Fundamentals filters only match companies scraped so far. Same shared filter schema (`src/lib/dashboard/screenerSchema.ts`) as Mitra's `run_screener` MCP tool below, so the two can never drift apart.

### `GET /api/screener` — `board` (update, #216)
- **`board=mainboard|sme|all`** selects the listing board (ADR 0066). Omitted = `mainboard`, which is what the API returned before SME was added. Every row carries `is_sme`. The same `board` is accepted by `/api/screener/export` (which adds a Board column) and `/api/screener/facets`, and by Mitra's and the MCP `run_screener` tool (compact rows carry `board`). Data service: `GET /screener`, `/screener/facets`, `/screener/stats` (adds `by_board`) and `/companies/master` take `board`; `GET /companies/{symbol}` reports `is_sme`.

### `GET /api/screener` — pagination, text search (update)
- Adds `q` (company/symbol contains-match), `industry`, `limit` (1–500, default 100) and `offset`. The body is still the plain array; the **total** matches (ignoring paging) is in the `X-Total-Count` response header. The Screener page pages with `limit` 25/50/100/200 + `offset`, and keeps the whole screen in the URL so it is shareable.

### `GET /api/screener/facets`
- **Purpose:** sector/industry options for the Screener dropdowns, with company counts: `{ sectors, industries, sector_counts, industry_counts }`. `?sector=` narrows `industries` to that sector. Public, read-only, cached ≤5 min (it grows as the fundamentals backfill progresses).

### `GET /api/funds`  _(Mutual funds, ADR 0067, #220)_
- **Purpose:** the mutual fund screener behind `/funds`: Indian mutual fund schemes with returns and risk ratios computed from AMFI's daily NAV. Direct-plan Growth schemes unless `plan`/`option` say otherwise.
- **Auth:** none (public, read-only; default rate-limit tier). Bare JSON, not the `{success,data,error}` envelope, the same deliberate exception as `/api/screener` and `/api/search`; errors are `{ error, message }`.
- **Query:** `q` (name text), `category` (`Equity` / `Debt` / `Hybrid` / `Solution Oriented` / `Other`), `sub_category`, `fund_house`, `plan` (`direct` default / `regular`), `option` (`growth` default / `idcw` / `other`), `min_ret_1y` / `min_ret_3y` / `min_ret_5y`, `max_expense_ratio`, `min_aum_cr`, `max_std_dev_3y`, `max_fall_3y` (worst 3-year fall at most this many percent), `exclude_thematic` (`true` leaves out sector and thematic funds, any SEBI spelling; default `false`), `min_sharpe_3y`, `sort` (a metric, `expense_ratio`, `aum_cr`, `name`, `nav`; default `ret_3y`), `order`, `limit` (1-200, default 50), `offset`.
- **Response:** `{ total, limit, offset, items: FundSummary[] }`. `FundSummary` = `{ scheme_code, name, base_name, fund_house, category, sub_category, plan, option, nav, nav_date, ret_1m, ret_3m, ret_6m, ret_1y, ret_3y, ret_5y, ret_10y, std_dev_3y, sharpe_3y, sortino_3y, max_drawdown_3y, sip_xirr_3y, sip_xirr_5y, expense_ratio, aum_cr }`. Percentages are plain numbers (14.4 = 14.4%).
- **Meaning of the numbers:** returns under a year are absolute; one year and over are annualised (CAGR). Risk figures use 3 years of daily NAV (annualised by the observed number of NAVs a year) and a 6.5% risk-free rate. A single-day NAV move over 40% is treated as a unit split or consolidation and neutralised first (ADR 0067). **`null` means not enough history, or, for `expense_ratio`/`aum_cr`, not disclosed to us yet. It is never zero, and a filter on that figure leaves the fund out.**
- **Errors:** `400` invalid filter; `503` `data_unavailable` when the data service is down.

### `GET /api/funds/export`  _(Mutual funds, #310)_
- **Purpose:** the "Download CSV" button on `/funds`, as `/api/screener/export` is for the screener. Same filters and sort as `GET /api/funds`; `limit`/`offset` are ignored and every matching fund is exported (capped at 10,000: `X-Export-Truncated: true` when the cap cuts the list, `X-Total-Count` always the full match count).
- **Auth:** none (public, read-only; default rate-limit tier). Returns `text/csv` (UTF-8 with a BOM, CRLF rows) as an attachment named `marketmitra-funds-<date>.csv`; errors are `{ error, message }` like `/api/funds`.
- **Columns:** scheme code, fund, fund house, category, sub-category, plan, option, NAV and date, returns 1M to 10Y, volatility, Sharpe, Sortino, worst 3Y fall, SIP XIRR 3Y and 5Y, expense ratio, AUM. Figures are raw numbers (percent without a % sign); an unavailable figure is blank, never zero. Text cells starting with `= + - @` get a leading apostrophe against spreadsheet formula injection.
- **Errors:** `400` invalid filter; `503` `data_unavailable` if the data service fails on any page (never a partial file).

### `GET /api/funds/facets`
- Categories with their sub-categories, fund houses and `nav_as_of`: `{ categories, sub_categories: { [category]: string[] }, fund_houses, nav_as_of }`.

### `GET /api/funds/{code}`
- One scheme (`code` = AMFI scheme code): `FundSummary` plus `{ scheme_type, isin_growth, isin_reinvest, peer_group, is_active, metrics_as_of, factsheet }`. `factsheet` is `null` until disclosed data is loaded, else `{ expense_ratio, aum_cr, exit_load, fund_manager, benchmark, launch_date, as_of, source }`. `400` for a non-integer or out-of-range code, `404` unknown, `503` data service down. Dormant schemes are returned (`is_active: false`).

### `GET /api/funds/compare`
- `?codes=122639,149329[,...]` — two or three different AMFI scheme codes. Returns `{ funds, best, summary }`: each fund's full detail (as `GET /api/funds/{code}`), in the order asked, and `best`, the scheme code that wins each row (`ret_1y`, `ret_3y`, `ret_5y`, `sip_xirr_3y`, `sip_xirr_5y`, `sharpe_3y`, `sortino_3y`, `std_dev_3y`, `max_drawdown_3y`, `expense_ratio`). Highest wins, except volatility and expense ratio (lowest wins); a tie, or fewer than two funds with a figure, gives `null`. `summary` is up to one plain-language point (`{ key: "tradeoff", tone, text }`): which fund leads the risk and cost measures (Sharpe, Sortino, volatility, worst fall, expense ratio) and which has the highest return, quoting figures from the table and never advising; it does not use anyone's portfolio, since this endpoint is public (a fund's fit against the caller's portfolio is `GET /api/funds/{code}/xray`). `400 invalid_codes` unless two or three valid, different codes are given, `404` naming an unknown code, `503` data service down.

### `GET /api/funds/{code}/xray`  _(auth)_
- The Mitra Fund X-Ray findings for the signed-in user, in the standard envelope: `{ success, data: { schemeCode, items: [{ key: "role" | "overlap" | "cost", tone: "positive" | "neutral" | "warning", text }], theme, sectors, portfolioPct, peerCount } }`. `role`: the kind of fund and its 3-year volatility against the peer median. `overlap`: the share of the portfolio already in the sectors the fund's theme invests in (`portfolioPct`, null when the theme is tied to no sector or nothing is priced); **sector level only**: a fund's own holdings are not loaded, so stock-level overlap is never claimed (the card's footer states the scope). A fund tied to no sector is described by what it is: an international fund by its overseas and rupee exposure, a diversified fund as holding across sectors. `cost`: expense ratio and worst 3-year fall against the peer medians (a median needs at least three peers with a figure). Computed from stored figures: no AI, no AI key. `400` bad code, `401`, `404`, `503`.

### `POST /api/insights/fund-xray`  _(auth, own AI key)_
- Body `{ code, force? }`. Mitra words the three findings above in plain language; it is given only those findings, so it cannot invent a figure or a stock-level overlap, and it uses the guarded prompt in every mode. `{ success, data: { content, model, generatedAt }, meta: { cached } }`, `content` being JSON `{ items: [{ key, tone, text }] }`; cached 12 hours per user and fund. `400 no_ai_key`, `401`, `404`, `422`, `429`, `502`, `503`.

### `GET /api/funds/{code}/nav`
- `?range=1m|6m|1y|3y|5y|10y|max` (default `1y`). Stored daily NAV as published, oldest first: `[{ date, nav }]`. A unit split appears as a step; returns and ratios are adjusted for it, this series is not.

### `GET /api/funds/{code}/peers`
- Up to 8 active schemes in the same peer group, plan and option, best 3-year return first: `FundSummary[]`. The peer group is the sub-category, except under SEBI's "Thematic Fund" (which mixes foreign-equity feeders, defence, healthcare and more), where it is the theme read from the scheme name; the detail response carries it as `peer_group`.

### `GET /api/screener/export`
- **Purpose:** download the screen as CSV. Same filter/sort params as `/api/screener`; `limit`/`offset` are ignored and **every** matching row is exported (cap 5,000). UTF-8 with BOM, CRLF, units in the headers; text cells beginning `= + - @` are apostrophe-prefixed to defuse spreadsheet formula injection. `400` on an invalid filter.

### `GET /api/stock/{ticker}`  _(ADR 0024)_
- **Purpose:** Screener.in-style "everything about this ticker" in one call — company profile, a live quote, ratios, shareholding pattern, peer comparison, document links, and financial statements. Replaces having to stitch together `GET /api/search` (name/symbol only) plus several separate fundamentals-api calls.
- **Auth:** public — no session required (same as `GET /api/search`/`GET /api/news`).
- **Request:** path param `ticker` (NSE symbol, case-insensitive). Optional query param `sections` — comma-separated subset of `company,quote,ratios,shareholding,peers,documents,financials`; omit for all.
- **Response:** `data`-less shape (bare JSON, same deliberate exception as `GET /api/search`/`GET /api/news`): `{ symbol, found: true, company?, quote?, ratios?, shareholding?, peers?, documents?, financials? }` — only the requested `sections` are present. `quote` is `{ symbol, price, prev_close, change_pct, week52_high, week52_low, as_of, source_tier }` or `null` if a live price wasn't available; `source_tier` is `"yahoo_finance2"` or `"tier1_nse_bse"` (see ADR 0024 — yfinance is no longer part of this path at all).
- **Errors:** `400` on an unrecognized `sections` value; `404` with `{ symbol, found: false, message }` when the symbol isn't recognized or every source came up short.
- **Note:** shares its aggregation logic (`src/lib/dashboard/stockAggregate.ts`) with the MCP `get_company_fundamentals` tool below, so a plain `curl`/browser call and an MCP client get the identical picture.

### `GET /api/alerts`
- **Purpose:** List the current user's alerts (all statuses), newest first. See [ADR 0014](./decisions/0014-alerts-engine-scope.md).
- **Auth:** required — Clerk session in hosted mode, fixed `"local"` user in self-host (`src/lib/currentUserId.ts`).
- **Request:** none.
- **Response:** `data`: `Alert[]` — `{ id, userId, type, symbol, params, note, status, rearm, cooldownMinutes, armed, cooldownUntil, lastEvaluatedAt, triggeredAt, lastObservedValue, peakPrice, source, createdAt, updatedAt }`. `type` ∈ `price_threshold | percent_move | week52_breach | portfolio_pnl | trailing_stop | cumulative_drawdown`; `params` shape depends on `type`. `peakPrice` is only meaningful for `trailing_stop` (null otherwise). `source` ∈ `user | auto_guardrail | mitra` (ADR 0030) — who created the alert.
- **Errors:** `401` if not authenticated.

### `POST /api/alerts`
- **Purpose:** Create an alert.
- **Auth:** required (see above).
- **Request:** body validated with Zod, discriminated on `type`:
  - `price_threshold` — `{ type, symbol, params: { direction: "above"|"below", threshold: number>0 } }`
  - `percent_move` — `{ type, symbol, params: { direction: "up"|"down"|"either", pct: number (0,100] } }`
  - `week52_breach` — `{ type, symbol, params: { edge: "high"|"low", withinPct?: number [0,50] } }`
  - `portfolio_pnl` — `{ type, symbol?: string|null, params: { metric: "total_value"|"unrealized_pnl"|"unrealized_pnl_pct", direction: "above"|"below", threshold: number } }` (`symbol` present = scoped to that one holding; absent = whole book)
  - `ipo_watch` — `{ type, params: { triggers: { opens: bool, lastDay: bool, allotmentListing: bool }, gmpThresholdPct?: number, ipoType: "all"|"mainboard" } }` (ADR 0017). **One per user** — POSTing this upserts the user's IPO-watch subscription (returns `200`, not `201`).
  - `ipo` — `{ type, params: { ipoSlug: string, trigger: "opens"|"last_day"|"allotment_listing"|"gmp_threshold", gmpThresholdPct?: number, gmpThresholdAbs?: number } }` — a per-IPO alert set from a row on `/ipos`.
  - `trailing_stop` — `{ type, symbol, params: { trailPct: number (0,50] } }` (ADR 0030). Fires when the price falls `trailPct`% below the highest price observed since the alert was created — the floor ratchets up with the stock, unlike `price_threshold`.
  - `cumulative_drawdown` — `{ type, symbol, params: { windowSessions: int [2,20], pct: number (0,100] } }` (ADR 0030). Fires when the price is down `pct`%+ versus its close `windowSessions` trading sessions ago — catches a slow multi-day slide that a single day's `percent_move` can miss.
  - plus optional `note` (≤200 chars), `rearm` (boolean, default false), `cooldownMinutes` (int 5–1440, default 60)
  - `source` is never accepted from the request body — it's always `'user'` for anything posted here; `'auto_guardrail'`/`'mitra'` alerts are created server-side only (`src/lib/alerts/guardrails.ts`, `src/lib/ai/chatTools.ts`).
- **Response:** `data`: the created alert, `201`.
- **Errors:** `401` unauthenticated, `422` on invalid input.

### `PATCH /api/alerts/[id]`
- **Purpose:** Edit an alert's `params`, `note`, `rearm`, `cooldownMinutes`, or `status` (`active`|`paused` only — `triggered` is set only by the engine). Any edit that changes `params` or `status` re-arms the alert (clears the cooldown/fired gate).
- **Auth:** required; scoped to the owning user.
- **Request:** partial body; `params` (when present) is validated against the existing alert's `type`.
- **Response:** `data`: the updated alert.
- **Errors:** `401` unauthenticated, `404` if not found/not owned, `422` on invalid input.

### `DELETE /api/alerts/[id]`
- **Purpose:** Remove an alert.
- **Auth:** required; scoped to the owning user.
- **Response:** `data: null`.
- **Errors:** `401` unauthenticated, `404` if not found/not owned.

### `GET /api/mitra-activity`
- **Purpose:** List every alert action Mitra has taken on its own — the default-guardrail hook on a new holding, or its own chat tools (ADR 0030) — most recent first, each with the `reason` it gave. A user's own edits made directly through the Alerts page are **not** logged here.
- **Auth:** required; scoped to the current user.
- **Response:** `data`: `MitraAction[]` — `{ id, userId, action, alertId, symbol, before, after, reason, source, createdAt }`. `action` ∈ `alert_created | alert_updated | alert_paused | alert_resumed`; `source` ∈ `auto_guardrail | mitra`; `before`/`after` are partial param/status snapshots for the diff shown on `/mitra-activity`.
- **Errors:** `401` unauthenticated.

> **Renamed:** these endpoints were `/api/wishlists…`. `/api/wishlists…` still works as a deprecated alias (same handlers) and is marked `deprecated` in `openapi.json`; stored data and the export field keep the old name.

### `GET /api/watchlists`
- **Purpose:** List the current user's stock wishlists (Markets page, ADR 0028), oldest-created first.
- **Auth:** required (see above).
- **Response:** `data`: `UserWishlist[]` — `{ id, userId, name, symbols: string[], createdAt, updatedAt }`.
- **Errors:** `401` unauthenticated.

### `POST /api/watchlists`
- **Purpose:** Create a wishlist.
- **Auth:** required.
- **Request:** body `{ name: string(1–60) }`.
- **Response:** `data`: the created wishlist, `201`.
- **Errors:** `401` unauthenticated, `409` per-user cap (20) reached, `422` invalid input.

### `PATCH /api/watchlists/[id]`
- **Purpose:** Rename a wishlist.
- **Auth:** required; scoped to the owning user.
- **Request:** body `{ name: string(1–60) }`.
- **Response:** `data`: the updated wishlist.
- **Errors:** `401` unauthenticated, `404` not found/not owned, `422` invalid input.

### `DELETE /api/watchlists/[id]`
- **Purpose:** Delete a wishlist.
- **Auth:** required; scoped to the owning user.
- **Response:** `data: { id }`.
- **Errors:** `401` unauthenticated, `404` not found/not owned.

### `POST /api/watchlists/[id]/symbols`
- **Purpose:** Add a stock to a wishlist. Deduped (adding an already-present symbol is a no-op success); capped at 50 symbols/wishlist.
- **Auth:** required; scoped to the owning user.
- **Request:** body `{ symbol: string(1–30) }` — upper-cased and trimmed server-side.
- **Response:** `data`: the updated wishlist.
- **Errors:** `401` unauthenticated, `409` wishlist not found or at the symbol cap, `422` invalid input.

### `DELETE /api/watchlists/[id]/symbols/[symbol]`
- **Purpose:** Remove a stock from a wishlist.
- **Auth:** required; scoped to the owning user.
- **Response:** `data`: the updated wishlist.
- **Errors:** `401` unauthenticated, `404` not found/not owned.

### `GET /api/tax`
- **Purpose:** Tax view of the holdings (#414): per holding short or long term (long = held more than 12 months), days until long term and unrealised gain; an estimate of tax on gains already booked and the extra tax if everything were sold today; and loss positions with what a realised loss would save against gains booked this financial year. **An estimate, not tax advice.** Rates and the exemption are constants in `lib/tax/india.ts` with an as-of date.
- **Auth:** required; scoped to the owning user.
- **Query:** `bookedShort`, `bookedLong` (numbers, default 0): gains already booked this financial year; a loss is negative.
- **Response:** `data`: `{ today, financialYear, rules, lots, summary, harvest, note }`. A holding without a purchase date (or a price) has `term: null`; it is never guessed and is excluded from the totals (`summary.unknownLots`).
- **Errors:** `401`, `422`.

### `PUT /api/holdings/[id]/purchase-date`
- **Purpose:** Set the date a holding was bought, or clear it with `null`. One date per holding, so a position bought in several tranches is treated as one lot.
- **Request:** `{ purchaseDate: "YYYY-MM-DD" | null }`, a real date, not in the future.
- **Errors:** `401`, `404` holding not found, `422`.

### `GET /api/notifications`
- **Purpose:** The in-app notification centre — the current user's notifications, newest first, plus an unread count. Alerts are the first producer; Phase 7/8 reuse this.
- **Auth:** required.
- **Request:** optional `limit` (1–100, default 50).
- **Response:** `data`: `Notification[]` — `{ id, userId, kind, title, body, href, meta, read, createdAt }`; `meta: { unread: number }`.
- **Errors:** `401` unauthenticated.

### `POST /api/notifications/read`
- **Purpose:** Mark notifications read.
- **Auth:** required.
- **Request:** body `{ id: string }` (one) or `{}` / `{ all: true }` (all of the user's unread).
- **Response:** `data: { updated: number }`.
- **Errors:** `401` unauthenticated, `422` on invalid input.

### `GET|POST /api/cron/evaluate-alerts`
- **Purpose:** Run one alert-evaluation cycle (ADR 0014 §3): load active alerts, batch-fetch live quotes from `services/fundamentals-api` `GET /quote`, run the per-type evaluators, transition each alert, and deliver notifications for newly-triggered ones. Vercel Cron calls this (GET) on `*/10 3-10 * * 1-5` (UTC — covers NSE hours); self-hosters point their own scheduler at the same URL.
- **Auth:** **not** a session — a `CRON_SECRET` bearer token. When `CRON_SECRET` is set, requires `Authorization: Bearer <CRON_SECRET>` (Vercel Cron adds this automatically). When unset: allowed in dev, refused (`503`) in production.
- **Request:** optional `?force=1` bypasses the NSE-trading-hours gate (for manual testing); still requires the token.
- **Response:** `data`: `{ ran: boolean, reason?, at, activeAlerts, symbolsQuoted, notified, skippedNoData, errors }`. `ran: false` when outside the trading session and not forced.
- **Errors:** `401` bad/missing token, `503` `CRON_SECRET` unconfigured in production, `500` if the cycle throws.
- **Note:** the handler degrades gracefully — a symbol with no live quote is skipped (counted in `skippedNoData`), never fired or auto-resolved on stale data.

### `GET /api/markets/overview`

- **Auth:** public. **Purpose:** NIFTY 50 breadth and NSE sectoral index moves for the Markets page.
- **Response:** `{ success, data: { breadth, sectors, asOf } }`. `breadth` is `{ advances, declines, unchanged, total, advancePct, ratio }` or `null` (fewer than 25 of the 50 constituents priced); `sectors` is `[{ label, changePct }]` best first, empty when the source is down. NIFTY 50 only, not the whole exchange. FII/DII is not offered (no free permitted source).

### `POST /api/insights/market`

- **Auth:** session. **Purpose:** two-sentence Mitra read on today's indices, breadth and sector moves, grounded only in those figures. Per-user cache 1h; body `{ force? }`; `400 no_ai_key`, `503` when market data is unavailable; `ai` rate tier.

### `GET /api/github/repo`

- **Auth:** public. **Purpose:** stars, contributor count, SPDX licence and latest release tag for `AnkushGitRepo/marketmitra`. The landing open-source panel uses the same fetch. Cached for about an hour.
- **Response:** `{ success, data: { stars, contributors, licence, latestRelease } }`. Each field is `null` when GitHub did not return it (no release, no licence, or the request failed). No invented numbers.

### `GET /api/version`

- **Auth:** public. **Purpose:** the running product version (SemVer; one version for the app and this API) and the short commit id the build was made from. `npm run deploy:prod` checks it after each deploy.
- **Response:** `{ success, data: { version, commit } }`.

### `POST /api/settings/ai/test`

- **Auth:** session; `ai` rate tier. **Purpose:** tests the signed-in user's *stored* AI key with a tiny request and reports the round trip.
- **Response:** `{ success, data: { provider, model, latencyMs } }`; `400` with the provider's reason (and `data.provider`, `latencyMs`) when the key is rejected; `404 no_ai_key` when nothing is stored. The key is never part of any response. Uses a few tokens of the user's own key.

### `GET /api/settings/email-alerts` and `PUT /api/settings/email-alerts`

- **Auth:** session. **Purpose:** whether a triggered alert is also emailed (on by default; `PUT { enabled }`), whether an email can actually be sent right now, and the last outcome.
- **Response:** `{ success, data: { enabled, deliverable, blockedBy, blockedText, maskedTo, last } }`. `blockedBy` is `disabled`, `provider_missing` or `no_address`; `blockedText` is the reason with the fix for this deployment; `maskedTo` is the masked address; `last` is `{ at, status: sent|failed|skipped, detail }` or null.
- `POST /api/settings/notifications/test` also accepts `channel: "email"`: a real test email through the same route (409 with the reason when it cannot be sent).

### `POST /api/settings/ai/models`

- **Auth:** session; `ai` rate tier. **Purpose:** the models an AI provider key can use (#333). Body `{ provider, apiKey? }`; without `apiKey` the saved key for the *same* provider is used (never another provider's). The server asks the provider's own fixed listing URL (Gemini, Anthropic, OpenAI, and each OpenAI-compatible provider's `/models`; OpenRouter's public list, which carries pricing and tool support and needs no key), merges the answer with the curated list in `src/lib/ai/providerCatalog.ts` and drops embedding, speech, image and moderation models.
- **Response:** `{ success, data: { source: "live" | "curated", models: [{ value, label, tier: latest|free|other, free, tools }] } }`. Any failure (network, timeout, rejected key, bad JSON) answers `200` with the curated list and `source: "curated"`. Cached 5 minutes per user and provider (nothing derived from the key is kept, so a changed key for the same provider gets the earlier list until the cache expires). The key is never returned, logged or put in an error. `401` signed out, `422` bad body.

### `GET /api/mitra/context`

- **Auth:** session. **Purpose:** the signed-in user's first name (hosted accounts) and holdings with live prices, to personalise the Mitra chat greeting and starter prompts. Own data only; unpriced holdings have `ltp: null`. Returns `{ success, data: { firstName, holdings[] }, error }`.

### `POST /api/insights/news`

- **Auth:** session. **Purpose:** two-sentence Mitra read on the dominant themes in the latest 20 headlines, grounded only in them. Per-user cache 1h; body `{ force? }`; `400 no_ai_key`, `503` when no headlines are available; `ai` rate tier.

### `GET /api/news`
- **Purpose:** Same-origin thin proxy to `services/fundamentals-api`'s `GET /news` (ADR 0015), so `/news` can "load more" and toggle its holdings filter client-side without exposing `FUNDAMENTALS_API_URL` to the browser. Same narrow, deliberate exception as `/api/search`.
- **Auth:** public — news is public market data. (The holdings filter's symbol list is computed server-side in `/news/page.tsx` and passed to the client, which forwards it here as `?symbols=`.)
- **Request:** `symbols` (optional, comma-separated), `limit` (1–50, default 20), `cursor` (opaque, from a previous response's `next_cursor`).
- **Response:** pass-through of the Python service's shape — `{ items: [{ url, title, summary, source, published_at, sentiment, sentiment_score, symbols[] }], next_cursor: string | null }`. Not the `{success,data,error}` envelope (same rationale as `/api/search`).
- **Errors:** upstream failure yields `{ items: [], next_cursor: null }`, not a 5xx.

### `GET|PUT|DELETE /api/settings/ai`
- **Purpose:** Manage the signed-in user's BYO AI provider key (ADR 0018 §2). Key is stored **AES-256-GCM-encrypted** in the `userSettings` Mongo collection, keyed on `SETTINGS_ENC_KEY`; it is decrypted only server-side per request and never returned to the browser.
- **Auth:** required (Clerk session in hosted mode; the fixed `local` user in self-host).
- **GET:** `data` = `{ provider, model, keyHint }` (last 4 chars of the key only) or `null` if none stored. `meta.encConfigured` reflects whether `SETTINGS_ENC_KEY` is set.
- **PUT:** body `{ provider: one of the eleven ids in `src/lib/ai/providerCatalog.ts` (`gemini`, `anthropic`, `openrouter`, `openai`, `groq`, `mistral`, `deepseek`, `xai`, `together`, `cerebras`, `sarvam`), apiKey: string(10–400), model?: string }`. Runs a live `validateAiKey` round-trip before storing — a rejected key is never saved. `503` when `SETTINGS_ENC_KEY` is unset, `400` on a provider-rejected key, `422` on a bad body.
- **DELETE:** clears the stored key.

### `GET|PUT /api/settings/notifications`
- **Purpose:** Manage the signed-in user's notification delivery channels — Slack, Telegram, WhatsApp, and a custom webhook (ADR 0028). Values are stored **AES-256-GCM-encrypted** in the same `userSettings` collection/key as the BYO AI key above; never returned to the browser.
- **Auth:** required.
- **GET:** `data` = `{ slack: {configured}, telegram: {configured, chatId}, whatsapp: {configured}, webhook: {configured}, updatedAt }`. `meta.encConfigured` reflects whether `SETTINGS_ENC_KEY` is set.
- **PUT:** body — any of `slackWebhookUrl`, `telegramBotToken`, `telegramChatId`, `whatsappWebhookUrl`, `customWebhookUrl` (all optional strings). A field present with a non-empty value sets/replaces that channel; present as an empty string clears it; omitted fields are left untouched. `503` when `SETTINGS_ENC_KEY` is unset, `422` on a malformed URL or bad body.

### `POST /api/settings/notifications/test`
- **Purpose:** Send one real test notification through a single already-saved channel, so the user can confirm delivery actually works before relying on it for a real alert.
- **Auth:** required.
- **Request:** body `{ channel: "slack"|"telegram"|"whatsapp"|"webhook" }`.
- **Response:** `data`: the `ChannelResult` from that one send attempt — `{ channel, status: "sent"|"error", detail? }`.
- **Errors:** `401` unauthenticated, `409` that channel isn't configured yet, `422` invalid input.

### `GET|PUT /api/settings/guardrails`
- **Purpose:** Turn the default guardrail alerts (ADR 0030) on or off — when enabled (the default), every newly added holding automatically gets a trailing-stop + cumulative-drawdown alert pair via `src/lib/alerts/guardrails.ts`. Does not touch alerts already created when turned off.
- **Auth:** required.
- **GET:** `data` = `{ enabled: boolean }`.
- **PUT:** body `{ enabled: boolean }`. `422` on a malformed body.

### `POST /api/insights/{stock|portfolio|ipo}`
- **Purpose:** Generate (or return a cached) neutral AI synthesis for one surface (ADR 0018). Guardrailed in `src/lib/ai/prompts.ts` — no buy/sell/hold, no price target, every response ends "This is a synthesis of public data, not investment advice."
- **Auth:** required. `stock` + `portfolio` use the caller's **own** key (or the `AI_*` env key **only** in self-host — `getUserAiConfig`); `ipo` also allows the deployment's key (ADR 0018 §5). `400 {error:'no_ai_key'}` when none is available.
- **Request:** `stock` → `{ symbol, force? }`; `portfolio` → `{ force? }`; `ipo` → `{ slug, force? }`. `force: true` bypasses a fresh cache.
- **Cache (`insights` collection, `{scope,key,userId}`):** `stock` per-user, keyed by symbol, 24h; `portfolio` per-user, key `'portfolio'`, 6h; `ipo` **cross-user shared** (`userId: null`), keyed by slug, 12h. A row is reused only while its input hash still matches and it is within the TTL.
- **Response:** `data` = `{ content, model, generatedAt }`; `meta.cached` = whether it came from the cache.
- **Errors:** `400` `no_ai_key` / no holdings / bad symbol-data; `404` unknown IPO slug; `502` on a generation failure (the error text is the provider's, normalised).

### `POST /api/research`  _(Phase 10b, ADR 0020 amendment)_
- **Purpose:** Generate a longer **structured research brief** — markdown sections (what it is / recent developments / the numbers / risks / open questions), retrieval + synthesis (no agentic loop). Same guardrail as the insight surfaces.
- **Auth:** required. Uses the caller's **own** AI key (`getUserAiConfig` — or the `AI_*` env key only in self-host). `400 {error:'no_ai_key'}` when none.
- **Request:** `{ subject: … }`, a discriminated union on `subject.type`:
  - `company` → `{ type, symbol }`
  - `theme` → `{ type, text }` (2–200 chars)
  - `portfolio` → `{ type }` (400 if no holdings)
  - `comparison` → `{ type, symbols: string[2..4] }`
- **Not cached** — each call is one generation (`ai` rate-limit tier). `generateInsightText` at ~3.5k output tokens.
- **Response:** `data` = `{ content (markdown), model, generatedAt }`; `meta` = `{ grounded, facts }`.
- **Errors:** `422` invalid subject, `400` `no_ai_key` / no holdings, `502` a bad symbol (`company`/`comparison`) or a generation failure. Degrades to structured-data-only (still 200) when retrieval is unavailable.

### `POST /api/ai/chat`
- **Purpose:** The "Mitra" widget's streamed chat (ADR 0018 pt.5). Agentic tool-calling loop (`stopWhen: stepCountIs(5)`): the model has `search_context` (vector search over the retrieval corpus), the 7 read-only market-data tools from the MCP layer, and — **as of ADR 0022** — 4 navigation tools (`navigate_to_dashboard`, `navigate_to_portfolio`, `navigate_to_markets`, `open_stock`). These, plus the two groups above, are the *entire* ToolSet — no settings/security/billing/destructive-action tool exists, by construction. A portfolio-context block and a page-context line (`{ page, ticker, range }`, ADR 0022) are seeded into the system prompt. Guardrail (`CHAT_SYSTEM_AGENTIC`) unchanged — no buy/sell/hold, same "not investment advice" ending. Completed turns are persisted (`chatMessages`, 100/user rolling cap); the caller's recent questions are re-embedded as `chat:<userId>`. Everything degrades to prompt-stuffing when vector search is unavailable.
- **Auth:** required. Per-user key rules identical to `/api/insights/stock` (`getUserAiConfig`). `400 {error:'no_ai_key'}` when none.
- **Request:** `{ messages: UIMessage[], pageContext?: { page: 'dashboard'|'portfolio'|'markets'|'stock', ticker?: string, range?: string } | null }` (AI SDK `UIMessage` shape, from `useChat`), 1–12 turns.
- **Response:** the AI SDK's **UI-message stream** (`streamText().toUIMessageStreamResponse()`, ADR 0022 — was a plain `text/plain` token stream before), not the `{success,data,error}` envelope. Tool-call parts (including the navigation tools) are part of the stream; the client (`AiWidget.tsx`, via `useChat`) reacts to a navigation tool part by calling `router.push`.
- **Errors:** `422` bad body, `400` `no_ai_key`, `502` if the stream can't start.

### Mitra chat workspace  _(ADR 0036, #33)_
All routes: auth required, envelope `{ success, data, error }` except the streaming and file-download responses. A conversation, its messages and its files are only ever visible to their owner.

- **`GET /api/mitra/conversations?q=`** — the caller's conversations, newest first; `q` filters titles (literal match). On a first visit with none, the widget's old single thread is migrated into "Earlier chat".
- **`POST /api/mitra/conversations`** — `{ title? }` (≤80 chars) → `201` conversation; `409` at the 200-conversation cap.
- **`GET /api/mitra/conversations/{id}`** — `{ conversation, messages }` (stored AI SDK `UIMessage`s, oldest first). `404` if not found or not yours.
- **`PATCH /api/mitra/conversations/{id}`** — `{ title }` rename.
- **`POST /api/mitra/conversations/{id}/title`** — writes a 3 to 7 word title from the first question and answer with the caller's own AI key (`titleSource` becomes `generated`). Changes nothing, and returns the conversation as it is, if the title was typed by the user or is already generated, there is no answer yet, the chat is longer than 8 messages, or the model call fails. `404` if not found or not yours.
- **`DELETE /api/mitra/conversations/{id}`** — deletes the conversation, its messages and its stored files.
- **`POST /api/mitra/conversations/{id}/messages`** — send one message; the **AI SDK UI-message stream** comes back. Request `{ message: { id, role: 'user', parts: [{type:'text', text} | {type:'file', url:'/api/mitra/files/<id>'}] } }` (text ≤8000 chars, ≤6 files, each file must be your own upload for this conversation). History is loaded server-side. Same `getUserAiConfig` key rules as the widget (`400 no_ai_key`); `422 attachment_unsupported` when the model cannot read an attachment (e.g. audio on a Claude key); `409` when the conversation is full; `429` (ai tier).
- **Platform data for the model:** the messages route gives Mitra a read-only `call_platform_api` tool over every documented GET endpoint except settings, cron, advisor, `/api/mitra/*`, logs and exports (ADR 0036). Writes are never reachable through it.
- **`POST /api/mitra/files`** — `multipart/form-data` `file` + `conversationId` → `201 { id, url, filename, mediaType, kind, size }`. Images (PNG/JPEG/GIF/WebP), PDF, audio (MP3/WAV/OGG/FLAC/M4A/WebM), `.txt/.csv/.md`; type decided from the bytes; ≤4 MB per file, 50 MB per user. `413`/`415`/`422`/`404` on rejection.
- **`GET /api/mitra/files/{id}`** — the file (owner only), `Range` supported (`206`/`416`), `nosniff` + sandbox CSP.
- **`DELETE /api/mitra/files/{id}`** — remove an attachment that was never sent (`404` once part of a message).

### Settings: preferences, export, bulk chat delete  _(ADR 0038, #37)_
All require auth. `/api/settings/*` is never reachable by Mitra's `call_platform_api` tool.

- **`GET /api/settings/preferences`** — `{ chat: { platformAccess, sendOnEnter, showToolActivity, dictationLanguage, memory, webSearch, richReplies }, display: { hideValuesByDefault }, shortcuts: { enabled } }`, always complete (defaults fill anything unset).
- **`PATCH /api/settings/preferences`** — send any subset; unknown groups/fields or wrong types → `422`. The `onboarding` group (`riskProfile`, `completed`, `dismissed`) is part of it.
- **`POST /api/onboarding`** _(ADR 0075, #306)_ — body `{ riskProfile?: 'conservative'|'balanced'|'aggressive', status?: 'completed'|'dismissed' }` (at least one; extra keys → `422`). Saves it and answers `{ riskProfile, completed, dismissed, holdings, hasAiKey, analystsQueued }`; `analystsQueued` is 0 without a saved AI key or with automatic analysts off.
- **`GET /api/settings/export`** — a JSON attachment of your holdings, notes, alerts, wishlists, Mitra conversations (attachments by reference) and preferences. Never includes API keys or notification secrets.
- **`DELETE /api/mitra/conversations`** — deletes all of your Mitra conversations with their messages and files → `{ removed }`.

### `POST /api/portfolio-import/extract`  _(ADR 0022)_
- **Purpose:** Extract candidate holdings from an uploaded broker screenshot/XLSX/CSV/DOCX/PDF, match each against the company database, and diff against the caller's existing holdings. **Writes nothing** — this is the preview step.
- **Auth:** required. CSV/XLSX need no AI key (deterministic parsing); image/PDF/DOCX use the per-user key (`getUserAiConfig`, `400 no_ai_key` when none). `ai` rate-limit tier.
- **Request:** `multipart/form-data`, field `file` (≤10 MB).
- **Response:** `data`: `ProposedChange[]` — each `{ tempId, extracted: {rawName, rawSymbol, quantity, avgPrice}, matchStatus: 'matched'|'ambiguous'|'unmatched', matchedSymbol, matchedName, candidates: SearchResultOut[], action: 'create'|'update', existingHoldingId, before, after }`.
- **Errors:** `401`, `400 no_ai_key`, `422 {error:'unreadable'|'no_holdings_found', message}`, `429` rate limited.

### `POST /api/portfolio-import/confirm`  _(ADR 0022)_
- **Purpose:** Commit the caller's explicitly approved subset of a `/extract` response. The only route that writes a Mitra-proposed portfolio change; no AI involvement.
- **Auth:** required. `ai` rate-limit tier.
- **Request:** `{ changes: [{ matchedSymbol, action: 'create'|'update', existingHoldingId, after: {quantity, avgPrice} }] }`, 1–100 items.
- **Response:** `data`: `{ succeeded: number, failedSymbols: string[] }`.
- **Errors:** `401`, `422` invalid body, `429` rate limited.

### `DELETE /api/ai/chat`  _(Phase 10a)_
- **Purpose:** Clear the caller's stored chat history and drop their `chat:<userId>` entry from the retrieval corpus.
- **Auth:** required.
- **Response:** `data`: `{ removed: <count> }`.
- **Errors:** `401` unauthenticated.

### `POST /api/agents/run`  _(Phase 11, ADR 0021 — on `phase-11-agents`, not deployed)_
- **Purpose:** Start an async multi-agent analysis run over one stock — analyst panel → bull/bear debate → synthesis briefing. **No trade decision is ever produced.** ~15–20 LLM calls on the caller's own key over a few minutes.
- **Auth:** required; per-user key (`getUserAiConfig`, `400 no_ai_key` when none). `ai` rate-limit tier. **One run in flight per user** (`409` otherwise).
- **Request:** `{ symbol }`.
- **Response:** `202` `data: { id }` — the run doc (`agentRuns`), created `queued`; the worker is kicked via `after()`.
- **Errors:** `400` `no_ai_key`, `401`, `409` a run already in progress, `422` bad symbol, `502` the symbol didn't resolve, `429` rate limited.

### `GET /api/agents/run/[id]`  _(Phase 11)_
- **Purpose:** Poll a run. Owner-scoped.
- **Response:** `data` = `{ id, symbol, companyName, status (queued|running|done|error), phase (analysts|debate|synthesis|complete), debateRoundsDone, briefing, briefingRegenerated, error, createdAt, updatedAt }`.
- **Errors:** `401`, `404` not found / not owned.

### `GET|POST /api/agents/tick`  _(Phase 11 — machine-to-machine)_
- **Purpose:** Advance ONE phase of ONE run, persist, and re-invoke itself until done — so no invocation runs long. Claims the oldest resumable run, or `?id=` for a specific one.
- **Auth:** `CRON_SECRET` bearer (dev-open, prod-`503`). `.github/workflows/agents-tick.yml` sweeps every 5 min as a safety net.
- **Response:** `data` = `{ picked: false }` when nothing to do, else `{ id, phase, status, done }`.

### `GET|POST /api/cron/stock-analysts`  _(Analyst Desk, ADR 0058 / 0062 — machine-to-machine)_
- **Purpose:** Gives every holding an analyst, builds pending dossiers (at most 4) and runs due end-of-day checks (at most 12). AI is called only for a new dossier or a material event, under the daily cap. On the hosted site, `.github/workflows/stock-analysts.yml` calls this every 20 minutes. A non-hosted process runs the same sweep for the user `local` when the app is up, including a catch-up after it was off. `LOCAL_AI_SCHEDULE=off` disables that runner.
- **Auth:** `CRON_SECRET` bearer, required in every environment (503 when unset). A non-hosted call only touches the user `local`.
- **Response:** `data` = `{ initiated, deferred, needsKey, checked, journaled, quiet, skippedOff, requeued, errors[] }`.

### `GET|POST /api/cron/analyst-dispatch`  _(Analyst Desk, ADR 0058 / 0062 — machine-to-machine)_
- **Purpose:** Rolls the last 24 hours of analyst journals into one morning brief per user, saved in the app and emailed when the user has email on. No AI call. One brief per user per India day. Hosted: `.github/workflows/analyst-dispatch.yml` at 08:30 IST. Non-hosted: the same run for the user `local` when the app is up.
- **Auth:** `CRON_SECRET` bearer, required in every environment.
- **Response:** `data` = `{ users, sent, nothing, already, skippedOff, errors }`.

### `GET|POST /api/cron/agents-reflect`  _(Phase 11 Part C — machine-to-machine)_
- **Purpose:** For each `done` run older than the reflection horizon (~21 days) with no reflection, write a hindsight **lessons** note (debate's key claims vs. the stock's actual move — per-user, never a verdict) and prune runs older than 120 days. `.github/workflows/agents-reflect.yml` daily.
- **Auth:** `CRON_SECRET` bearer (dev-open, prod-`503`).
- **Response:** `data` = `{ considered, written, skipped, error, pruned, errors[] }`.

### `GET|POST /api/cron/index-corpus`  _(Phase 10a — on `phase-10-rag`, not yet in prod)_
- **Purpose:** Rebuild the shared retrieval corpus (ADR 0020): pull recent news + configured annual-report filings, chunk + locally embed, upsert into the `chunks` collection under `userId: null`, prune news past a retention window. Runs from `.github/workflows/index-corpus.yml` (every 2 h) and self-hosters' own schedulers.
- **Auth:** `CRON_SECRET` bearer, same contract as `/api/cron/evaluate-alerts` (dev-open, prod-`503` when unset).
- **Request:** `?indexesOnly=1` ensures the collection + Atlas Vector Search index and returns (self-host one-time setup); `?newsLimit=<n>` overrides how many recent news items are reconsidered.
- **Response:** `data`: `{ vectorIndex: 'created'|'exists'|'unavailable', news: { seen, changed, pruned }, filings: { seen, indexed, skipped }, errors: string[], ms }`.
- **Errors:** `401` bad token, `503` `CRON_SECRET` unconfigured in production, `500` if the run throws.
- **Note:** `vectorIndex: 'unavailable'` (non-Atlas MongoDB) is reported as a non-fatal error — writes still succeed; retrieval simply falls back until an Atlas cluster is used.

### `GET /api/status`  _(system status/logs feature)_
- **Purpose:** Live health snapshot for MongoDB Atlas, the fundamentals API, the MCP tool registry, the Upstash rate limiter, and Clerk auth configuration — checked in real time on each request (no persisted history for these), plus the most recent event-log entry for each of the 3 crons. Backs both the public `/status` page and the admin `/system` page.
- **Auth:** public. `detail` on a failing component is a fixed generic phrase ("Not responding") or a bare HTTP status, never the underlying error text (#312); the real error goes to the server log.
- **Response:** `data`: `{ checkedAt, overall: 'operational'|'degraded'|'down', components: [{ id, label, status, detail?, latencyMs? }], crons: [{ id, label, lastRun: SystemEvent|null }] }`. `overall` is the worst of MongoDB / fundamentals-api / MCP (the rate limiter and Clerk report `not_configured` in self-host without affecting `overall`).

### `GET /api/system/logs`
- **Purpose:** Paginated read of the `systemEvents` collection (30-day TTL) — currently populated by the 3 cron routes (`evaluate-alerts`, `index-corpus`, `agents-reflect`), each logging one `info`/`warn`/`error` entry per run with a duration and a small `meta` summary.
- **Auth:** required.
- **Request:** `?level=info|warn|error`, `?source=<string>` (e.g. `cron:evaluate-alerts`), `?limit=<1-200>` (default 50), `?before=<ISO timestamp>` (pagination cursor — strictly-before).
- **Response:** `data`: `SystemEvent[]` — `{ id, ts, level, source, message, durationMs?, meta? }`, newest first.
- **Errors:** `401` unauthenticated.

**Note:** the dashboard's stock/ratios/financials/shareholding/price/indices/quote/news data comes from `services/fundamentals-api` (a separate service, documented in its own `README.md` — see ADR 0011), consumed directly by Next.js Server Components rather than proxied through a `/api/*` route, since it's an already-documented service being consumed, not a new one MarketMitra is shipping. `/api/search` above is the one deliberate exception.

## MCP server — `/api/mcp` (Phase 9, ADR 0019)

The **supported interface for automated / agent access to public data.** A
stateless Streamable HTTP MCP server mounted in the Next app
(`src/app/api/mcp/route.ts` via `mcp-handler`), wrapping the same
`src/lib/dashboard/*` clients the dashboard uses. Tool logic lives in
`src/lib/mcp/tools.ts`; `src/lib/mcp/server.ts` registers it.

- **Endpoint:** `GET|POST /api/mcp` — client config `{ "url": "https://<host>/api/mcp" }`. Streamable HTTP (2025-era clients get the SDK's stateless fallback). No SSE, no sessions.
- **Auth:** none in v1 — all tools are read-only public data. Rate-limited (Phase 9 Part 2). Per-user tools (portfolio / alerts / settings) are explicitly deferred pending an MCP auth design.
- **Guardrail:** every tool result that touches market data carries a "public reference data, not investment advice" note; news carries "headline tone, not a signal"; IPO GMP carries "unofficial grey-market estimate".
- **Discovery:** `/llms.txt` (static, `public/llms.txt`) points agents here.

### Tools (v1)

| Tool | Input | Returns |
| --- | --- | --- |
| `search_symbols` | `{ query: string }` | `{ query, count, results: [{type,symbol,name}] }` — ≤15 matches across ~2,570 NSE equities + indices |
| `get_quote` | `{ symbols: string[1..50] }` | `{ count, quotes: QuoteOut[], missing: string[], note }` — unknown symbols reported in `missing`, never faked |
| `get_company_fundamentals` | `{ symbol: string, sections?: ("company"\|"quote"\|"ratios"\|"shareholding"\|"peers"\|"documents"\|"financials")[] }` | `{ symbol, found, company?, quote?, ratios?, shareholding?, peers?, documents?, financials?: {profit_and_loss,balance_sheet,cash_flow} }` — `found:false` with a hint when the symbol is unknown. As of ADR 0024 this also includes a live `quote`, and the same aggregation backs the plain REST `GET /api/stock/{ticker}` above |
| `get_price_history` | `{ symbol: string, period?: "1mo"\|"6mo"\|"1y"\|"5y" }` (default `1y`) | `{ symbol, period, count, points: PricePointOut[] }` — newest first |
| `get_news` | `{ symbols?: string[≤20], limit?: 1..50, cursor?: string }` (default limit 20) | `{ count, items: NewsItem[], next_cursor, note }` — omit `symbols` for the broad stream; `sentiment` = headline tone only |
| `list_ipos` | `{ status?: "upcoming"\|"open"\|"closed"\|"listed" }` | `{ count, ipos: Ipo[], note }` — GMP fields are an unofficial third-party estimate; `sub_qib` / `sub_nii` / `sub_snii` / `sub_bnii` / `sub_retail` are the latest category-wise subscription multiples (null when unknown) with `sub_as_of` |
| `get_market_indices` | `{}` | `{ count, indices: IndexQuoteOut[], note }` — NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX |
| `run_screener` | `ScreenerFilters` (see [ADR 0025](./decisions/0025-screener-bulk-ingestion-and-shared-filter-schema.md), [0033](./decisions/0033-screener-hybrid-refresh-and-ranked-search.md)) — `<field>_min`/`<field>_max` for market cap/P-E/P-B/ROE/ROCE/dividend yield/debt-equity/sales & profit growth CAGR, plus `sector`/`industry`/`q`/`sort_by`/`order`/`limit`/`offset` | `{ count, results: CompactRow[≤20], truncated, appliedFilters, coverage?, hint?, note }` — `count` is the true total match count; compact rows use `market_cap_cr`, `roe_pct`, …; `coverage` appears when the screen uses scraped fundamentals |
| `get_screener_options` | `{ sector?: string }` | `{ sectors: {name, companies}[] }`, or with `sector` `{ industries: {name, companies}[] }` — the exact names `run_screener` accepts; a misspelled name silently matches nothing |

Field shapes (`QuoteOut`, `PricePointOut`, `NewsItem`, `Ipo`, `IndexQuoteOut`, …) are defined in `src/lib/dashboard/{fundamentalsApi,newsApi,iposApi}.ts` and documented in `services/fundamentals-api/README.md`. Any field can be null/empty when the free source chain came up short; every record carries `source_tier`.

<!--
Template for a new entry:

### `GET /api/<resource>`
- **Purpose:** <what it does>
- **Auth:** required (Clerk session) | public
- **Request:** <query params / body shape>
- **Response:** <shape of `data`>
- **Rate limits:** <if any>
- **Errors:** <notable error cases>
-->


## Personal access tokens (ADR 0053)

Hosted mode only; self-host is already open. Create, list and revoke tokens in Settings > Account, or with the browser-session-only
endpoints below. A token is shown once at creation and only its SHA-256 hash is stored.

- `GET /api/settings/tokens` — list your tokens (`id, name, scope, prefix, createdAt, expiresAt, lastUsedAt, status`); never the secret. Session only.
- `POST /api/settings/tokens` — body `{ name, scope: "read"|"write", expiry?: "never"|"30d"|"90d"|"365d" }` (default 90d). Returns `201` with the plaintext `token` once; `409` at 10 active tokens. Session only.
- `DELETE /api/settings/tokens/{id}` — revoke, effective immediately. Session only.

Using a token: `Authorization: Bearer <token>`. `read` allows GET/HEAD/OPTIONS, `write` allows all methods. Tokens are rejected (403) on
`/api/settings/*`, `/api/cron`, `/api/advisor`, `/api/system/logs` and on any non-`/api` path, and are rate limited per token.


## Stock brief (ADR 0054, ADR 0056)

- `GET /api/stock/{ticker}/candles?interval=1m|5m|15m|30m|1h|1d|1w|1mo[&last=N]` — candles for one timeframe (ADR 0069), oldest first; `last` (1 to 50) returns only the newest bars for live polling. Intraday `time` is epoch seconds shifted to IST as a string, daily, weekly and monthly `time` is the date. Response `data: { symbol, interval, bars[], pollMs, marketOpen }`. Public, read-only, Yahoo (delayed, unofficial).
- `GET /api/stock/{ticker}/live` — one live quote for the page header: `data: { symbol, price, prevClose, changePct, asOf, pollMs, marketOpen }`.
- `GET /api/insights/chart-overlay?symbol&interval` — the signed-in user's saved AI Auto-Charts for that stock and timeframe, newest first (`data: { runs[] }`, ADR 0071). A saved trade setup is returned only while the caller is in unrestricted mode now. `POST /api/insights/chart-overlay` — body `{ symbol, interval? }` (`interval` 1m, 5m, 15m, 1h or 1d, default 1d). Generates a new AI Auto-Chart with the caller's own AI key (`no_ai_key` 400 if none), saves it beside the earlier ones (latest 10 kept) and returns it as `data: { run, saved? }`; `run` is `{ id, symbol, interval, mode, overlay: { levels[{kind,price,label}], trendlines[{a,b}], indicators[], setup?, setupNote? }, model, lastClose, createdAt }`. `setup` (direction, entry, stop, target, riskReward, stopPct, targetPct, entryType `now|pullback|retest`, lastClose) is planned by the server, not taken from the model, and exists only in unrestricted mode (a local install or a hosted admin, ADR 0068, 0070). `DELETE /api/insights/chart-overlay/{id}` — removes one of your saved runs (404 for anyone else's).
- `POST /api/insights/stock-brief` — body `{ symbol, force? }`. Up to five points (`quality`, `growth`, `valuation`, `ownership`, `risk`), each `{ key, signal: strength|neutral|concern, text }`, written from computed figures (ROCE/ROE, debt/equity, free cash flow, CAGRs, peer-median P/E, promoter/FII/DII change, headline tone, distance from the 52-week high and 200-day average) with the caller's own AI key (`no_ai_key` 400 if none). Cached 12 h per user, symbol and mode. Response `data: { brief: { points[], valuation?, entry? }, mode, generatedAt }`; `valuation` / `entry` appear only in unrestricted mode, which exists only on local / self-host instances and for hosted admins (`ADMIN_USER_IDS`, ADR 0070), and is off by default. The figures themselves are shown on the stock page without calling this endpoint.

## Structured widget briefs (ADR 0057)

`POST /api/insights/portfolio` (dashboard), `/api/insights/market`, `/api/insights/news` and `/api/insights/ipo` now return `data.content` as JSON, `{ "items": [{ "key", "tone", "text" }] }`, instead of a paragraph. Keys: dashboard `return` / `exposure` / `risk`; market `breadth` / `leaders` / `catalyst`; news `earnings` / `macro` / `sector`; IPO `listing` / `offer` / `business` / `risk` (plus `listingcall` / `longterm`, only in an unrestricted brief, [0073](./decisions/0073-ipo-brief-research-and-unrestricted-verdict.md)). `tone` is `positive`, `neutral` or `warning`. The figures are computed on the server and given to the model; a `[TICKER]` tag appears only for a ticker present in the data. Older cached prose briefs are ignored and regenerated on request.

### Mitra memory (#402, ADR 0083)

- **`GET /api/mitra/memories`** - what Mitra remembers about the caller, newest first.
- **`POST /api/mitra/memories`** `{ text, kind? }` - add a memory the user writes (4 to 300 characters; identity, bank and login details are refused with 422; 409 when 100 are stored).
- **`DELETE /api/mitra/memories`** - forget everything.
- **`PATCH /api/mitra/memories/{id}`** `{ text, kind? }` and **`DELETE /api/mitra/memories/{id}`** - edit or forget one.

