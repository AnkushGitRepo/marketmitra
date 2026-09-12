# Data Sources

Living registry of every external data source (API or scraper) the system depends on. This file describes the system **as it currently stands** — it is never pruned or archived, only updated. Update it the same session a data source is added, changed, or removed.

For each source, record: what it is, the endpoint(s) used, auth/key requirements, rate limits, cost, and — for scraping targets specifically — a ToS check before implementation.

## Policy

- Prefer public/free APIs first.
- **No paid data vendors, full stop** — MarketMitra has no paid tier, no billing, no trial limits ([ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md)). This supersedes the earlier "paid APIs where public ones don't cover the need" allowance — an earlier plan involving a paid vendor (EODHD) was dropped for exactly this reason.
- Scraping is last resort, only for data with no free API alternative, and requires a ToS review flagged and resolved before implementation (not built first and checked later).

## Active sources

### Retrieval embeddings — `services/fundamentals-api` `POST /embed` (fastembed / `bge-small-en-v1.5`)
- **Type:** internal service endpoint + a bundled model dependency (NOT a third-party runtime data source)
- **Used for:** Phase 10a retrieval (ADR 0020). The main app can't run ONNX embeddings in its Vercel serverless runtime (`onnxruntime-node` can't load `libonnxruntime.so.1`), so `src/lib/rag/embed.ts` POSTs text to the fundamentals-api's `/embed`, which embeds it with `fastembed` (`BAAI/bge-small-en-v1.5`, 384-dim, L2-normalised). Both the corpus indexer and query-time vector search go through this.
- **Endpoint(s):** `${FUNDAMENTALS_API_URL}/embed`, server-to-server, `IPO_INGEST_TOKEN` bearer. The quantised ONNX model (~64 MB, `qdrant/bge-small-en-v1.5-onnx-q`) is downloaded from the HF hub **once per function instance** to `fastembed_cache_dir` (`/tmp` on Vercel) and reused.
- **Auth:** `IPO_INGEST_TOKEN` (the shared trusted-caller secret) between the two services; none for the model download.
- **Rate limits:** the fundamentals-api's own fair-use limiter applies; `/embed` batches are capped at 64 texts.
- **Cost:** free (Apache-2.0 model, Apache-2.0 `fastembed` + `onnxruntime`).
- **ToS notes:** not a scrape; a published open-weights model via its official distribution. No third-party content is fetched at request time.

### NSE (National Stock Exchange) public endpoints
- **Type:** public API (unofficial — no formal developer program or SLA)
- **Used for:** quotes, corporate actions, IPO data (`nsepython`), shareholding pattern (direct call to `/api/corporates-holdings`), XBRL quarterly result filings
- **Endpoint(s):** `www.nseindia.com/api/*` — via the `nsepython` library, plus a direct `httpx` call for `/api/corporates-holdings` (not wrapped by any library)
- **Auth:** none — but requires replicating a browser session/cookie handshake (visit the homepage first) or requests are rejected
- **Rate limits:** no official published limit; ~3 req/s is the community-reported practical ceiling, respected as etiquette in `app/ingestion/rate_limit.py`
- **Cost:** free
- **ToS notes:** NSE's site terms don't sanction automated collection of these endpoints. In practice, NSE enforces this at the infrastructure level — this project's own dev environment was blocked outright by NSE's Akamai edge (403 on a plain homepage GET) during development. Accepted trade-off, documented plainly in [ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md) — not presented as an officially sanctioned integration.

### BSE (Bombay Stock Exchange) public endpoints
- **Type:** public API (unofficial), via the `bsedata` library
- **Used for:** quotes (fallback/companion to NSE within Tier 1)
- **Endpoint(s):** wrapped by `bsedata`; not called directly
- **Auth:** none
- **Rate limits:** none published; treated with the same etiquette as NSE
- **Cost:** free
- **ToS notes:** same unofficial-access caveat as NSE. Verified working live during development in the same environment where NSE was blocked — the two exchanges did not fail together.

### Yahoo Finance (`yfinance`)
- **Type:** public API (unofficial, reverse-engineered — no formal support contract from Yahoo)
- **Used for:** Tier 2 fallback — live/historical price data, and quote-field gap-fill (company name, industry, sector) when Tier 1 doesn't return them. Also the sole backing source for `GET /indices` and for `GET /quote` (batched live quote — last price / prev close / intraday % / 52-week range — polled by the Phase 5 alerts engine, see [ADR 0014](./decisions/0014-alerts-engine-scope.md)); NSE/BSE are blocked from this environment and Screener.in is fundamentals-only, so yfinance is the only viable source for index-level and intraday-quote data.
- **Endpoint(s):** wrapped by the `yfinance` library
- **Auth:** none
- **Rate limits:** none officially published; `yfinance` handles its own request pacing
- **Cost:** free
- **ToS notes:** unofficial API with no SLA — accepted trade-off per ADR 0011. Verified working live during development.

### Screener.in
- **Type:** scraper (Tier 3, last resort) **and**, separately, the Screener feature's bulk universe source (ADR 0025)
- **Used for:** named/computed ratios (P/E, ROCE, ROE, etc.) not available as raw data from Tiers 1–2; also a fallback for shareholding pattern and financial statement line items — **and**, via a second, independent access pattern, the entire NSE universe's screener_metrics table (market cap, P/E, P/B, ROE, ROCE, dividend yield, debt/equity, 3y sales/profit growth CAGR, sector/industry)
- **Endpoint(s):** `https://www.screener.in/company/<symbol>/consolidated/`, via `scrapling`'s static `Fetcher` — same URL pattern for both access patterns, just at very different scale and cadence (one page per user request vs. ~2,570 pages once daily)
- **Auth:** none
- **Rate limits:** none published. The per-company lazy path retries with backoff on failure (`app/ingestion/tier3_screener_scrapling/scraper.py`); the bulk path (`scripts/refresh_screener_universe.py`) self-imposes 2 req/s — deliberately more conservative than NSE's own ~3 req/s community rate, since this is a much larger sustained burst than any single lazy fetch generates.
- **Cost:** free
- **ToS notes:** Screener.in is a community/personal site, not a documented API, and its terms don't contemplate automated scraping. Reviewed and accepted as a known trade-off in [ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md) — kept in an isolated, swappable module specifically because of this risk. Selectors verified against two independent real companies' pages (Reliance via live fetch, Newgen Software via a maintainer-saved page used as a permanent test fixture). The bulk path was live-tested against 5 real companies (see ADR 0025) — a full ~2,570-company run has not yet happened, so its behavior under that sustained load is a tracked, not assumed-solid, risk.
- **Universe list for the bulk path:** `GET /companies/master` (a new fundamentals-api endpoint) reuses the existing `company_master` table populated from NSE's own `EQUITY_L.csv`, rather than the bulk script re-fetching NSE independently — see ADR 0025.

### Indian markets RSS feeds (news)
- **Type:** public RSS feeds (offered for syndication)
- **Used for:** the global markets news stream (Phase 6, [ADR 0015](./decisions/0015-news-feed-scope.md))
- **Endpoint(s):** Economic Times Markets, LiveMint Markets, The Hindu BusinessLine Markets, Moneycontrol Business — exact URLs in `services/fundamentals-api/app/ingestion/news.py` (`BROAD_FEEDS`). Business Standard's markets RSS was evaluated but 403s to non-browser clients, so it's excluded (as is NDTV Profit's feedburner feed — too much non-markets content).
- **Auth:** none
- **Rate limits:** none published; polled at most every `news_broad_cache_ttl_minutes` (~30 min) via lazy refresh-on-read
- **Cost:** free
- **ToS notes:** these are RSS feeds the outlets publish for syndication. MarketMitra stores and displays only the headline, the short RSS summary, the publish timestamp, and a link back to the original article — no article body is fetched or scraped. Each item links out to the source. This is ordinary RSS consumption, not scraping; reviewed 2026-09-06.

### Google News RSS
- **Type:** public RSS (Google-provided search-results feed)
- **Used for:** per-company news on the stock-detail and portfolio views (Phase 6) — one query per company name (`"<name>" NSE`), giving an exact symbol tag by construction
- **Endpoint(s):** `https://news.google.com/rss/search?q=...&hl=en-IN&gl=IN&ceid=IN:en`
- **Auth:** none
- **Rate limits:** none published; one request per tracked/held symbol, at most every `news_symbol_cache_ttl_minutes` (~60 min) via lazy refresh
- **Cost:** free
- **ToS notes:** Google News RSS is a public feed Google serves; entries link back to the publishers (via `news.google.com` redirects) and MarketMitra keeps only headline + summary + link + timestamp, no article bodies. Reviewed 2026-09-06.

### Chittorgarh (IPO calendar + subscription + grey-market premium)
- **Type:** scraper (Tier 3, last resort — Phase 7, [ADR 0017](./decisions/0017-ipo-tracker-gmp-scope.md))
- **Used for:** IPO calendar (dates, price band, lot size, issue size), live subscription figures, and **grey-market premium (GMP)** — none of which has a free official API. NSE/BSE public IPO endpoints are the Tier 1 attempt for the non-GMP fields; GMP is Tier 3 only.
- **Endpoint(s):** `https://www.chittorgarh.com/` IPO dashboard pages, via `scrapling`'s static parser, isolated in `services/fundamentals-api/app/ingestion/tier3_ipo_scraper/`
- **Auth:** none
- **Rate limits:** none published; scraped at most every `ipo_cache_ttl_minutes` (~60) via lazy refresh-on-read, with request pacing and a browser-like User-Agent
- **Cost:** free
- **ToS notes:** Reviewed 2026-09-06. Chittorgarh's Disclaimer & Privacy Statement (`chittorgarh.com/article/disclaimer-and-privacy-statement/238/`) states *"no user may distribute, modify, transmit, or use the contents in any manner for public or commercial purposes without prior written permission"*, and the site returns `403` to non-browser clients. This is **not a sanctioned integration** — it is an accepted known risk on the same terms as Screener.in (ADR 0011): kept in one isolated, swappable module; GMP shown only with an "unofficial grey-market estimate, not from any exchange" caveat and degrading to "unavailable" on any scrape failure; alerts on GMP skip rather than fire on missing data. If the source becomes unworkable, the module is swapped or GMP is dropped, without touching the rest of the IPO tracker.

<!--
Template for a new entry:

### <Source name>
- **Type:** public API | paid API | scraper
- **Used for:** <feature(s) that depend on this>
- **Endpoint(s):** <base URL / specific endpoints>
- **Auth:** <API key env var name, or none>
- **Rate limits:** <requests/min, daily quota, etc.>
- **Cost:** <free tier limits, paid tier cost>
- **ToS notes:** <only for scraping — link/summary of terms reviewed, date reviewed>
-->
