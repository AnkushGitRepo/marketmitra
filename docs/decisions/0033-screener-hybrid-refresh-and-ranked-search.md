# 0033: Screener hybrid refresh + ranked in-memory search

Date: 2026-11-06
Status: accepted, built (not yet deployed at time of writing)

## Context

NSE's `EQUITY_L.csv` / `SME_EQUITY_L.csv` carry only symbol, name, series,
listing date, ISIN and face value — **no financials**. They make search and
the screener *universe* cheap, but cannot populate the screener itself. The
screener was empty in production because `screener_metrics` had never been
filled (ADR 0025's full ~2,570-page Screener.in scrape was never run), and
re-running that full scrape daily is the wrong shape: fundamentals change
quarterly, the scrape is ~21 min of sustained load on a site that publishes no
rate limit, and one bad day blanks everything.

Search ranked only `ILIKE` symbol-prefix then alphabetical, ignored SME
listings and ISINs, and had no typo tolerance.

## Decision

### Screener: two sources, each refreshed at its natural cadence

- **Price-derived fields** — market cap (₹ Cr), price, P/E, P/B, dividend
  yield — come from Yahoo `quote()` in 100-symbol chunks (~26 requests for the
  whole universe) via `POST /api/cron/refresh-screener-quotes`, weekdays after
  the close (`refresh-screener-quotes.yml`). The Next app does this (not the
  Python service) because `yahoo-finance2` is already the app's live-quote
  source (ADR 0024) and batches natively. It posts to fundamentals-api
  `POST /screener/quotes` (bearer `SCREENER_INGEST_TOKEN`). Non-positive P/E
  and P/B are dropped, not stored, so loss-makers never match "P/E under 20".
- **Fundamentals** — ROE, ROCE, debt/equity, 3y growth, sector, industry —
  stay on the Screener.in scraper, but **incremental**: `GET /screener/stale`
  returns companies with missing/oldest `fundamentals_updated_at` (never-scraped
  first, larger market cap first) and `refresh_screener_universe.py
  --stale-first --limit 400` refreshes only those. The universe cycles in
  ~a week. A manual `full` workflow dispatch does the one-time backfill.
- **Ownership rule:** once a symbol has a live quote, the Screener.in ingest no
  longer overwrites the five quote-owned fields. `fetch_status = 'quote_only'`
  rows (price data, no fundamentals yet) are real rows: price/valuation filters
  work for the whole universe before the backfill finishes; ROE/ROCE/etc.
  filters only match scraped companies, and the page says so
  (`GET /screener/stats` → coverage line).
- Universe = main-board only (`company_master.is_sme = false`); SME stays
  searchable but out of the screener.
- Sorting is now **server-side** (`sort_by` allow-listed against the range
  fields, `order`, NULLs last, market cap tie-break) so "sort by ROE" ranks the
  whole matching set, not just the 100 rows on screen. `sort_by`/`order` are part
  of the shared `screenerFiltersSchema`, so Mitra's `run_screener` gets them too.
- The page's default filter is data-aware: ROE/debt default only once ≥300
  companies have fundamentals; before that it starts from market cap.

### Search: richer master + ranked in-memory index

- `company_master` gains `isin`, `series`, `listing_date`, `face_value`,
  `is_sme`; populated from both NSE CSVs, falling back to copies bundled in
  `services/fundamentals-api/app/data/` when `archives.nseindia.com` blocks the
  host. Existing rows are re-populated automatically when none carry an ISIN.
- Ranking (`search_index.py`, pure Python over a cached ~2.6k-row snapshot,
  1h TTL): ISIN exact → exact symbol → symbol prefix → name prefix → every
  query token prefixes a name word (order-independent) → symbol/name contains →
  `difflib` typo tolerance (≥4 chars). Ties: main board before SME, larger
  market cap first, shorter symbol. No Postgres extension needed.
- UI: dropdown shows sector/SME chips, keyboard navigation (↑ ↓ Enter Esc),
  a "no match" state, 120 ms debounce.

## Consequences

- New: migration `c7a91e3d5f02`; `POST /screener/quotes`, `GET /screener/stale`,
  `GET /screener/stats`; `GET /companies/master?include_sme=`; cron route +
  workflow; `src/lib/screener/bulkQuotes.ts`.
- Changed: `refresh-screener.yml` is incremental by default (cron was **not**
  active yet, so no behaviour regression); `/search` results gain `sector`,
  `series`, `is_sme`.
- **Deploy needs:** run the migration against Neon; set `SCREENER_INGEST_TOKEN`
  and `FUNDAMENTALS_API_URL` on the `marketmitra-v2` Vercel project; confirm
  `CRON_SECRET` + `SCREENER_INGEST_TOKEN` repo secrets; run
  `refresh-screener-quotes` once, then `refresh-screener` with `full` for the
  backfill, and review failure rate before leaving the schedules on.
- Known limits: Yahoo's P/E and market cap can differ from Screener.in's
  consolidated figures; dividend yield units from Yahoo are sanity-capped at 25%.
  Yahoo may rate-limit a datacenter IP — a failed chunk is skipped and retried
  next run.
