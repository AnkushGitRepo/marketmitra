# 0066 — SME stocks alongside the main board

Status: accepted · Date: 2026-11-17 · Issue: #216 · Amends [0033](./0033-screener-hybrid-refresh-and-ranked-search.md)

## Context

ADR 0033 made the screener universe main-board only and left SME "searchable but out of the screener". In production that was
not even true: the company master held 2,630 companies and **no SME rows**. NSE's live `SME_EQUITY_L.csv` was not reachable from the
data service, and the copy bundled as a fallback was a five-line stub (one company, which has since moved to the main board). So
SME stocks were missing from search, the screener and the quote feed alike.

## Decision

- **A real SME list is bundled** (`services/fundamentals-api/app/data/SME_SYMBOLS.csv`, `SYMBOL,NAME OF COMPANY,SERIES`, 567 rows: the symbols
  from NSE's SME Market Watch download, the names from Yahoo, no prices). NSE's live file is still tried first; the bundled list is the
  fallback. The names are bundled so that search by company name works from the first request. Yahoo only has short, upper-case names for
  about half of them (for example "ACTIVE INFRASTRUCTURES L"); the daily quote feed replaces a placeholder name, and a placeholder
  never overwrites a real one. An SME refresh never flips a main-board row.
- **A populated master gets its SME rows without a manual step.** `ensure_company_master_populated` adds them once per process from the
  bundled list (never over the network, so no request waits on NSE) when the master has none.
- **`board` replaces the hard-coded exclusion**: `mainboard | sme | all` on `/screener`, `/screener/facets`, `/screener/stats` and
  `/companies/master` (`include_sme=true` stays as an alias for `all`). Without `board` the API answers the main board only, exactly
  as before, so existing API and MCP callers see no change. The board comes from `company_master.is_sme` through a join, so no
  migration is needed. The screener page defaults to **All** with a Board control and an SME badge on each SME row; a shared link with no
  `board` keeps meaning the main board.
- **The dashboard's top gainers and losers never include SME.** They are built from the fixed large-cap watchlist, and a test
  (`src/lib/dashboard/movers.test.ts`) fails if a watchlist symbol is an SME company or a mover is quoted from outside it.
- **Yahoo's plain ticker is wrong for SME; the series-suffixed one is right.** Measured against the NSE SME Market Watch file: for
  `SYMBOL.NS` only 2% of prices were within 2% of NSE's and 84% were more than 25% off (many are dead lines last traded 2024-07-23),
  while `SYMBOL-SM.NS` / `SYMBOL-ST.NS` were 100% within 10% and 426 of 474 were quoted within a day. Yahoo carries the suffixed ticker
  for 474 of 567 SME symbols and gives a price but no market cap, P/E or P/B. So: the daily quote job asks for SME **only** by the suffixed
  ticker and drops a quote older than 7 days; the live-quote path (`fetchYahooQuotes`) rejects a stale quote and tries the `-SM`/`-ST`
  tickers; the price-history fetch tries them when the plain history is empty or dead. The ~93 SME symbols with no suffixed ticker get no
  Yahoo price (their plain ticker is dead), only what Screener.in provides.
- **Screener.in fills what Yahoo leaves empty.** The scrape used to leave a quoted symbol's market cap, P/E and P/B untouched; for SME
  that discarded the only source of those figures. They are now filled in only where the quote left them empty (`coalesce`).
  In a 40-symbol sample every SME page existed on Screener.in (sector 40/40) but fundamentals are thinner than the main board: ROE,
  ROCE, P/E and P/B for 24, 3-year sales growth for 14 and profit growth for 12 (young listings have no three years).
- **Nightly cost stays flat.** Fundamentals are scraped stalest-first as before, but SME gets at most 25% of a run so a newly added SME
  universe cannot starve the main-board refresh. The scrape job's failure-rate check is judged on the main board only, because
  Screener.in does not carry every SME symbol; SME failures are reported, not counted. The quote job adds about six Yahoo requests.

## Consequences

- SME companies report half-yearly, so some quarterly-based figures will be empty; the stock page says so for SME companies.
- SME percentage moves and ratios are extreme. The default "All" screen can therefore surface them; the Board control narrows it.
- Rolling it out needs a data-service deploy (Cloud Run) and an app deploy, both with the maintainer's go-ahead. The SME rows appear on the
  first request after the data service starts; fundamentals fill in over the next scheduled runs.
- Price history is thin for SME on Yahoo (the suffixed line often has only recent bars); the chart shows what exists.
- A company created on first view could carry just its symbol as its name; `GET /companies/{symbol}` now prefers the master's name.
- The screener's opening size floor (market cap ≥ ₹5,000 Cr) steps aside when the user picks SME, since it would hide nearly every SME company.
