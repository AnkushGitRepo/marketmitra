# 0066 — SME stocks alongside the main board

Status: accepted · Date: 2026-11-17 · Issue: #216 · Amends [0033](./0033-screener-hybrid-refresh-and-ranked-search.md)

## Context

ADR 0033 made the screener universe main-board only and left SME "searchable but out of the screener". In production that was
not even true: the company master held 2,630 companies and **no SME rows**. NSE's live `SME_EQUITY_L.csv` was not reachable from the
data service, and the copy bundled as a fallback was a five-line stub (one company, which has since moved to the main board). So
SME stocks were missing from search, the screener and the quote feed alike.

## Decision

- **A real SME symbol list is bundled** (`services/fundamentals-api/app/data/SME_SYMBOLS.csv`, `SYMBOL,SERIES`, 568 rows from NSE's SME
  Market Watch download, no prices). NSE's live file is still tried first; the bundled list is the fallback. It has no company names,
  so an SME row starts with its symbol as a placeholder name and the daily Yahoo quote feed supplies the real one. A placeholder never
  overwrites a real name, and an SME refresh never flips a main-board row.
- **A populated master gets its SME rows without a manual step.** `ensure_company_master_populated` adds them once per process from the
  bundled list (never over the network, so no request waits on NSE) when the master has none.
- **`board` replaces the hard-coded exclusion**: `mainboard | sme | all` on `/screener`, `/screener/facets`, `/screener/stats` and
  `/companies/master` (`include_sme=true` stays as an alias for `all`). Without `board` the API answers the main board only, exactly
  as before, so existing API and MCP callers see no change. The board comes from `company_master.is_sme` through a join, so no
  migration is needed. The screener page defaults to **All** with a Board control and an SME badge on each SME row; a shared link with no
  `board` keeps meaning the main board.
- **The dashboard's top gainers and losers never include SME.** They are built from the fixed large-cap watchlist, and a test
  (`src/lib/dashboard/movers.test.ts`) fails if a watchlist symbol is an SME company or a mover is quoted from outside it.
- **Nightly cost stays flat.** Fundamentals are scraped stalest-first as before, but SME gets at most 25% of a run so a newly added SME
  universe cannot starve the main-board refresh. The scrape job's failure-rate check is judged on the main board only, because
  Screener.in does not carry every SME symbol; SME failures are reported, not counted. The quote job adds about six Yahoo requests.

## Consequences

- SME companies report half-yearly, so some quarterly-based figures will be empty; the stock page says so for SME companies.
- SME percentage moves and ratios are extreme. The default "All" screen can therefore surface them; the Board control narrows it.
- Rolling it out needs a data-service deploy (Cloud Run) and an app deploy, both with the maintainer's go-ahead. The SME rows appear on the
  first request after the data service starts; fundamentals fill in over the next scheduled runs.
- Not verified before release: that Screener.in and Yahoo carry every SME symbol (those that they do not carry simply show no figures).
