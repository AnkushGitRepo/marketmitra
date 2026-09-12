# 0024: Live-quote fix (yahoo-finance2 + NSE/BSE) and a stock aggregate endpoint

Date: 2026-09-12
Status: accepted, built

## Context

The user reported that prices shown on dashboard cards and in the portfolio
were "very different from current price." Investigation (not assumption)
found two independent causes:

1. The one real live-quote path in the codebase — `getQuotes()` in
   `src/lib/dashboard/fundamentalsApi.ts` → `GET /quote` on
   `services/fundamentals-api` → `yfinance`'s `Ticker(...).fast_info` — was
   used **only** by the alerts-engine cron ([ADR 0014](./0014-alerts-engine-scope.md))
   and the MCP `get_quote` tool. `fast_info` is a lightweight, sometimes-stale
   summary field. NSE/BSE were never consulted for it at all, despite
   `get_nse_quote`/`get_bse_quote` already existing in
   `app/ingestion/tier1_nse_bse.py` — the module's own docstring assumed
   NSE/BSE were blocked "from this environment," generalizing a dev/CI-specific
   finding from [ADR 0011](./0011-three-tier-fundamentals-data-sourcing.md)
   into a blanket claim about the actual deployment.
2. **The dashboard UI itself never called that path at all.** The home page,
   markets page (`src/lib/dashboard/quotes.ts`'s `getTopMovers`/
   `getWatchlistQuotes`), the portfolio (`src/lib/dashboard/enrichedHoldings.ts`),
   and the stock detail page all derived "current price" from the **latest
   end-of-day close** instead — stale by up to a full trading day by
   definition, independent of which live-quote source is used.
3. Separately: the public API surface had no single "get everything about
   this ticker" endpoint. `GET /api/search` (name+symbol only, an
   autocomplete source by design) was the closest thing. The real
   screener.in-style aggregation already existed, but only reachable via
   MCP tool-calling (`get_company_fundamentals`), and even that omitted live
   price entirely.

## Decision

### 1. yahoo-finance2 (new Next.js dependency) is the primary live-quote source; NSE → BSE is the fallback; yfinance is removed from this path

`src/lib/dashboard/yahooQuote.ts` (new) calls
[`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) (pure JS, no
native bindings — confirmed by reading its source and package metadata,
requires Node ≥22, this project runs Node 24 both locally and on Vercel) for
every symbol first. `getQuotes()` in `fundamentalsApi.ts` falls back to
fundamentals-api's `/quote` route only for symbols yahoo-finance2 couldn't
resolve.

`quotes.py` was rewritten to try `tier1_nse_bse.get_nse_quote()` first, then
(if a `bse_code` is known — see the known limitation below) `get_bse_quote()`,
and return nothing if both come up short. **yfinance has been removed from
this path entirely** — an explicit product decision, not an oversight: a
caller either gets a real exchange/Yahoo-sourced price or none at all, never
a `fast_info` guess. `get_nse_quote`/`get_bse_quote` were extended to also
return `prev_close`/`week52_high`/`week52_low` (previously only used for
`day_high`/`day_low`), since those fields are load-bearing for existing
alert types (ADR 0014) and now need to come from NSE/BSE instead of yfinance.

This scoped reordering is deliberately narrow: **ADR 0011's three-tier
fundamentals-ingestion chain (ratios/financials/shareholding/peers, still
Postgres-backed) is completely unchanged.** This ADR touches only the live
"price right now" read path.

New `source_tier` value: `"yahoo_finance2"` (Next-side only — it doesn't
exist in the Python `SourceTier` enum, since yahoo-finance2 never runs in
Python; a deliberate asymmetry). NSE and BSE quote hits both report the
existing `"tier1_nse_bse"` value, since BSE is still Tier 1 per ADR 0011,
not a new tier.

This is the first non-Clerk/non-AI-SDK external data-fetching dependency
living directly in the Next app rather than proxied through
`services/fundamentals-api`. Justified narrowly: pure JS with no native
bindings (safe on Vercel, unlike the Python-only tooling ADR 0011 carves out
`services/fundamentals-api` for), and avoids an extra network hop on a
hot, frequently-called path. This is **not** a precedent for moving any of
fundamentals-api's other responsibilities (ratios, financials, shareholding,
scraping) into Next.js — those remain squarely Python-only-tooling territory
per ADR 0011.

### 2. The dashboard UI is rewired to the real live quote

This was necessary, not optional: fixing only the yfinance source without
also fixing what the dashboard actually calls would have left every card
exactly as stale as before. `enrichedHoldings.ts`, `quotes.ts`'s
`getTopMovers`/`getWatchlistQuotes`, and the stock detail page's header price
now all call the live-quote path (`getQuotes()`), falling back to the
end-of-day close only when a live quote genuinely isn't available (so a page
never shows nothing).

### 3. New public REST endpoint — `GET /api/stock/{ticker}`

`src/lib/dashboard/stockAggregate.ts` (new) holds one `getStockAggregate()`
function — company profile, live quote, ratios, shareholding, peers,
documents, and financials, optionally narrowed by `sections` — shared by both
the new route (`src/app/api/stock/[ticker]/route.ts`) and the existing MCP
`get_company_fundamentals` tool, so a plain `curl`/browser call and an MCP
client get an identical picture instead of two implementations drifting
apart. `quote` is a genuinely new field on the MCP tool too — it never
included live price before this.

Response is a bare JSON body (`{ symbol, found, company?, quote?, ratios?,
shareholding?, peers?, documents?, financials? }`), **not** the
`{success,data,error}` envelope most routes use — the same deliberate
exception already established for `GET /api/search` and `GET /api/news`
(public, read-only, pass-through market data).

## Known limitation, stated plainly

**BSE fallback is currently a stub.** Nothing in this codebase populates
`CompanyORM.bse_code` for any company, and `bsedata` has no symbol→scripCode
lookup of its own — `resolve_company()`'s own docstring already flagged this
as a tracked gap before this change. The BSE branch of the new NSE→BSE chain
is wired in and will start working automatically once a symbol→BSE-code
mapping exists, but until then it is inert for every company. Building that
mapping is separate, tracked future work (ROADMAP.md), not solved here — NSE
alone (plus yahoo-finance2 as the true primary) is still a strict
improvement over yfinance-only.

## Consequences

- **New:** `yahoo-finance2` dependency; `src/lib/dashboard/yahooQuote.ts`;
  `src/lib/dashboard/stockAggregate.ts`; `GET /api/stock/{ticker}`.
- **Changed:** `getQuotes()` in `fundamentalsApi.ts` (yahoo-finance2 primary,
  fundamentals-api fallback); `services/fundamentals-api/app/ingestion/quotes.py`
  (NSE → BSE, no yfinance); `get_nse_quote`/`get_bse_quote` (now also return
  `prev_close`/`week52_high`/`week52_low`); `enrichedHoldings.ts`,
  `dashboard/quotes.ts`, and the stock detail page (all now call the live
  quote instead of deriving from end-of-day closes); the MCP
  `get_company_fundamentals` tool (delegates to the shared aggregation
  function, gains a `quote` field).
- **Unaffected:** ADR 0011's three-tier fundamentals-ingestion chain for
  ratios/financials/shareholding/peers; ADR 0014's alerts engine (still calls
  the same `getQuotes()`/`/quote` contract, now just better-sourced
  underneath, no caller-side changes needed).
- Self-host: identical behavior to hosted — yahoo-finance2 has no API key or
  paid tier, same as every other data source this project uses.
