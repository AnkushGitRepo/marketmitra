# 0025: Screener — bulk-ingestion pipeline + shared filter schema

Date: 2026-09-13
Status: accepted, built (Parts A-D). Docs pass (Part E) in progress; the
archiving/pruning protocol is deliberately not run yet — pending explicit
approval.

## Context

The user asked for a Screener page — filter the NSE stock universe by
financial criteria (P/E, ROE, market cap, sector, etc.) and get a results
table — plus a Mitra chat tool that runs the same screening via natural
language, explicitly requiring that Mitra's tool map onto the *same*
filter schema the UI uses. The spec was explicit that v1 filters are
fixed-field presets (dropdowns/range min-max), not a custom query/formula
builder, and that Mitra must never be able to express a filter the UI
itself can't represent — the same lesson this project already learned
once, from a navigation tool that referenced a page that didn't exist yet
(ADR 0022).

**Investigating the data layer (this ADR's real Step 1) found a genuine
blocker, not just a missing index.** Every table in
`services/fundamentals-api` except `company_master` (symbol + name only,
from a static NSE CSV) is populated **lazily, one company at a time**,
only when a user views that company's page. A screener needs criteria
data across most of the ~2,570-company universe to be useful — that data
didn't exist for the vast majority of companies. This was surfaced to the
user directly rather than building a UI against a dataset that couldn't
support it; the user's direction (confirmed): build the bulk-ingestion
pipeline now, as the real prerequisite it is, and additionally compute
P/B, Debt/Equity, and sales/profit growth (all derivable from data the
existing per-company scraper already extracts in one page fetch — no new
scraping surface) alongside the five directly-scraped fields (Market Cap,
P/E, ROCE, ROE, Dividend Yield).

## Decision

### 1. A new `screener_metrics` table, separate from the existing per-company tables

`RatioORM`/`PeerComparisonORM` are EAV-shaped and serve the per-company
lazy stock-detail path — unsuitable for "give me every company with ROE >
15% across the whole universe" queries. `ScreenerMetricsORM` is a new,
wide, typed table: one row per company, 9 numeric filter columns (market
cap, P/E, P/B, ROE, ROCE, dividend yield, debt/equity, sales growth 3y
CAGR, profit growth 3y CAGR) plus `sector`/`industry`, each **individually
btree-indexed**. At today's row count (~2,570) this is about documenting
intent and correctness under the access pattern, not a measured
performance necessity — but it's the right shape as the universe and
query load both grow, and building it un-indexed now would just mean
adding the same migration later under time pressure. `fetch_status`
(`ok`/`partial`/`failed`) lets a bulk job's per-company failure show up as
"this scrape didn't work," not silently as "confirmed zero" — the read
path (`query_screener_metrics`) excludes `fetch_status = 'failed'` rows
unconditionally, so a failed scrape never shows up disguised as a company
with no debt or 0% ROE.

### 2. Bulk ingestion is a new architectural pattern for this service: out-of-band, universe-wide, on a cron

Every existing ingestion path in `fundamentals-api` runs inline with a
user request. This is the first pipeline that scrapes the *entire*
company universe out-of-band, mirroring `refresh_ipos.py`'s existing
shape exactly: a standalone script
(`scripts/refresh_screener_universe.py`) fetches the symbol list from a
new `GET /companies/master`, then POSTs batched results to a new
bearer-token-authenticated `POST /screener/ingest` — same shared-secret
pattern as `POST /ipos/ingest`, run by a new
`.github/workflows/refresh-screener.yml` (daily, `30 20 * * *` UTC).

**The load trade-off, stated plainly**: ~2,570 requests against
Screener.in per run, at a deliberately conservative 2 req/s (more
conservative than NSE's own ~3 req/s community-etiquette rate, since
Screener.in states no rate at all and this is a much larger sustained
burst than any single lazy fetch ever generates) — about 21 minutes of
arithmetic run time, `timeout-minutes: 45` for headroom. Per-symbol
failures are logged and skipped, never abort the run; the job only exits
non-zero if the overall failure rate exceeds 20%, which likely means
Screener's markup changed or the run got blocked.

**Verification status, tracked honestly**: a `--limit 5` local test run
against real Screener.in succeeded (5 companies across 4 sectors —
Metals & Mining, Financial Services ×2, Healthcare, Information
Technology — data confirmed sane via direct `psql`/`curl` inspection, not
just "didn't crash"). The full ~2,570-company production run, and this
run's actual wall-clock time and failure rate under that real load, have
**not** yet happened — this is a known, tracked gap, not an assumed-solid
claim. Two live bugs were caught and fixed during this limited testing
(a wrong balance-sheet label guess, `Equity Share Capital` → `Equity
Capital`; a `Decimal`-not-JSON-serializable crash on ingest) — both are a
reason for, not evidence against, treating the untested full-universe
run as a real risk. Activate the cron only after a real full-universe
`workflow_dispatch` run has been reviewed.

### 3. `RANGE_FIELD_DEFS` is the one array everything derives from

`src/lib/dashboard/screenerSchema.ts` defines every range field once —
`{ key, label, unit? }` — and derives both the UI's field list
(`SCREENER_RANGE_FIELDS`/`SCREENER_FIELDS`) and the Zod filter schema
(`screenerFiltersSchema`, via a mapped type keyed off the array's literal
`key`s: `{ [K in RangeFieldKey as `${K}_min` | `${K}_max`]: ... }`) from
that single source. `runScreener(filters: ScreenerFilters)`
(`src/lib/dashboard/screener.ts`) is the one function three callers share
— the Screener page, `GET /api/screener`, and the `run_screener` MCP
tool — the same "one function, every caller" shape already established
for `getStockAggregate` (ADR 0022), extended from two callers to three.
Because the MCP tool's `inputSchema` **is**
`screenerFiltersSchema` directly (not a hand-typed copy), Mitra
structurally cannot express a filter the UI's field list doesn't also
define — the invariant the user asked for is enforced by TypeScript's
type system and Zod's parse boundary, not by a documentation promise.

Every percentage-shaped field (ROE, ROCE, dividend yield, both growth
CAGRs) is stored and returned as a raw percentage number (`14.4` meaning
14.4%), never a 0–1 fraction — including the two CAGR fields, computed at
the scraper (`_compute_cagr` in `scraper.py`) specifically so no layer
above it needs to special-case which fields are "already ×100."

### 4. `run_screener` is a data tool, not a navigation tool

It returns matching rows inline (capped at 20, with `truncated: true` and
the true `count` when more exist), the same shape `get_quote`/
`search_symbols` already use — not `open_stock`'s "confirm a destination,
let the client navigate" shape. Jumping the user out of an active chat
conversation on every screening question would be jarring and inconsistent
with every other read-only data capability Mitra has. A follow-on
`open_screener(filters)` navigation tool (mirroring `open_stock`'s
dynamic-param pattern, needing a new case in `AiWidget.tsx`'s
`TOOL_ROUTES`) is a reasonable fast-follow, explicitly deferred here, not
forgotten.

## Consequences

- **New:** `screener_metrics` table + migration + indexes;
  `fetch_screener_snapshot`/`_compute_debt_to_equity`/`_compute_cagr`/
  `_compute_growth` in the Tier-3 scraper; `screener_service.py`;
  `POST /screener/ingest` + `GET /screener` + `GET /screener/facets`;
  `GET /companies/master`; `scripts/refresh_screener_universe.py` +
  its GitHub Actions workflow; `screenerSchema.ts`/`screener.ts`;
  `GET /api/screener`; the `run_screener` MCP tool; `/dashboard/screener`.
- **Changed:** `fundamentalsApi.ts`'s `getJson` exported (was
  module-private) for `screener.ts` to reuse; `AppHeader`'s nav gains a
  "Screener" entry between Markets and Alerts.
- **Cost:** free — Screener.in bulk scrape, same as every other Tier-3
  data source (ADR 0011); no AI call in the UI path (`run_screener` costs
  whatever the user's own BYO chat turn already costs).
- **Self-host:** identical to hosted — same script, same schema, same
  rate limit; the cron needs `SCREENER_INGEST_TOKEN` configured the same
  way `IPO_INGEST_TOKEN` already is.
- Verified live: the filter panel, default preset, sortable results
  table, stock-detail navigation, and empty state all exercised in a
  real browser against 5 real ingested companies; `run_screener`'s
  wiring verified via its unit tests and `chatTools.ts`'s unchanged
  generic MCP-wrapping loop (already proven for 7 other tools) — the
  live LLM tool-call loop itself was not exercised end-to-end, since
  this local environment has no BYO AI key configured.

## Explicitly out of scope

- **A custom query/expression builder.** v1 is fixed-field min/max +
  sector-equality only, on both sides of the shared schema. This is a
  deliberate later-phase boundary, not an oversight — extending
  `screenerFiltersSchema` to arbitrary expressions is real, separate
  scope with its own security and UX questions (arbitrary user-composed
  filter logic against a database), not a small addition to this build.
- **`open_screener(filters)`** — a navigation-tool counterpart to
  `run_screener`, deferred per Decision §4 above.
- **Activating the daily cron** before a real full-universe
  `workflow_dispatch` run has been reviewed for wall-clock time and
  failure rate (see Decision §2's verification status).
- **Industry as a UI filter field** — the schema and API support
  `industry` equality (finer-grained than `sector`) and `get_screener_facets`
  already returns industry options, but the Screener page's filter panel
  only exposes `sector` for v1, to keep the panel from being too dense on
  first load. Trivial to add later from data that already exists.
