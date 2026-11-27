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

### AI providers (bring-your-own key)
- **What:** the model APIs a user's own key calls, server-side only. Eleven providers: Google Gemini, Anthropic, OpenRouter, OpenAI, and (OpenAI-style, fixed base URL) Groq `api.groq.com/openai/v1`, Mistral `api.mistral.ai/v1`, DeepSeek `api.deepseek.com/v1`, xAI `api.x.ai/v1`, Together AI `api.together.ai/v1`, Cerebras `api.cerebras.ai/v1`, Sarvam AI `api.sarvam.ai/v1` (Indian, key from indus.sarvam.ai).
- **Auth / cost:** the user's key, stored encrypted; MarketMitra pays nothing and never sees a shared quota. Gemini, Groq, Cerebras, Mistral and OpenRouter's `:free` models have free tiers; others are pay as you go.
- **Limits:** each provider's own; a rate-limit or quota error is shown to the user.
- **Model IDs:** change often. `src/lib/ai/providerCatalog.ts` records `MODELS_LAST_REVIEWED` and is reviewed every 8-12 weeks; the live list below covers the gap in between.
- **Model listing (#333):** `POST /api/settings/ai/models` asks each provider for the models the key can use: Gemini `generativelanguage.googleapis.com/v1beta/models` (key in `x-goog-api-key`), Anthropic `api.anthropic.com/v1/models` (`x-api-key`), OpenAI `api.openai.com/v1/models` and each compatible provider's `<base>/models` (Bearer key), and OpenRouter's public `openrouter.ai/api/v1/models` (no key; carries pricing, so `$0` and `:free` models are marked Free, and `supported_parameters`, so a model without `tools` gets a warning). URLs are fixed in code, the key is sent only to its own provider, results are cached 5 minutes per user and provider (the key is never hashed or stored), and any failure falls back to the curated list. A few extra requests per settings visit; no cost.

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

#### Yahoo Finance: cash, debt and enterprise value (research report, #365, ADR 0081)

- **Used for:** the figures the report needs for net debt and EV/EBITDA, which neither Screener's balance sheet nor the stored filings give a cash line for. `Ticker.balance_sheet` gives annual **Total Debt** and **Cash Cash Equivalents And Short Term Investments** (stored as balance-sheet rows `Total Debt` and `Cash and Short-Term Investments`, tier `tier2_yfinance`, ₹ crore); `Ticker.info` gives the current **enterpriseValue, totalCash, totalDebt and ebitda**, stored with the ratios as `Enterprise Value`, `Total Cash`, `Total Debt (latest)`, `Net Debt`, `EBITDA (TTM)` and `EV/EBITDA`.
- **Cadence:** fetched lazily with the ratios and balance sheet, one `info` plus one `balance_sheet` call per company, cached in memory for the ratios TTL (a failure or a company Yahoo does not know is remembered for an hour, so a Yahoo outage is not retried on every request).
- **Units:** Yahoo reports in rupees; stored in ₹ crore to the paisa. A report in any other currency is refused, not relabelled.
- **Lenders are excluded:** banks, NBFCs and insurers (sector `Financial Services`) get no enterprise figures and no Yahoo balance-sheet rows, because debt and cash are their business and EV/EBITDA would mislead.
- **Checked live 2026-11-25** on Reliance (EV/EBITDA 12.1x, net debt ₹2.42L Cr), Newgen (net cash ₹1,075 Cr), TCS (net cash ₹39,216 Cr) and HDFC Bank (none, as intended). Yahoo's FY26 total debt for Reliance (₹3.98L Cr) is close to Screener's borrowings (₹4.03L Cr); the definitions differ slightly (Yahoo includes lease obligations), which is why the report computes net debt from Yahoo's two lines only. `Total Debt (latest)` is the latest quarter and can differ from the last fiscal year's row.

#### Yahoo Finance: sector indices and NIFTY 50 breadth (Markets page, ADR 0044)

Read from the Next app via `yahoo-finance2` (not the fundamentals service). Sector performance uses the NSE sectoral indices
(`^CNXIT`, `^NSEBANK`, `^CNXPSUBANK`, `^CNXFIN`, `^CNXAUTO`, `^CNXFMCG`, `^CNXPHARMA`, `^CNXMETAL`, `^CNXENERGY`,
`^CNXREALTY`, `^CNXINFRA`, `^CNXMEDIA`); breadth is computed from one batched quote of the NIFTY 50 constituents. Cached about
60s per server instance. Delayed/unofficial like all Yahoo data. **FII/DII flows have no free permitted source** (NSE blocks us)
and are not shown.

### Screener.in
- **Type:** scraper (Tier 3, last resort) **and**, separately, the Screener feature's bulk universe source (ADR 0025)
- **Used for:** named/computed ratios (P/E, ROCE, ROE, etc.) not available as raw data from Tiers 1–2; also a fallback for shareholding pattern and financial statement line items — **and**, via a second, independent access pattern, the entire NSE universe's screener_metrics table (market cap, P/E, P/B, ROE, ROCE, dividend yield, debt/equity, 3y sales/profit growth CAGR, sector/industry)
- **Endpoint(s):** `https://www.screener.in/company/<symbol>/consolidated/`, via `scrapling`'s static `Fetcher` — same URL pattern for both access patterns, just at very different scale and cadence (one page per user request vs. ~2,570 pages once daily)
- **Auth:** none
- **Rate limits:** none published. The per-company lazy path retries with backoff on failure (`app/ingestion/tier3_screener_scrapling/scraper.py`); the bulk path (`scripts/refresh_screener_universe.py`) self-imposes 2 req/s — deliberately more conservative than NSE's own ~3 req/s community rate, since this is a much larger sustained burst than any single lazy fetch generates.
- **Cost:** free
- **ToS notes:** Screener.in is a community/personal site, not a documented API, and its terms don't contemplate automated scraping. Reviewed and accepted as a known trade-off in [ADR 0011](./decisions/0011-three-tier-fundamentals-data-sourcing.md) — kept in an isolated, swappable module specifically because of this risk. Selectors verified against two independent real companies' pages (Reliance via live fetch, Newgen Software via a maintainer-saved page used as a permanent test fixture). The bulk path was live-tested against 5 real companies (see ADR 0025) — a full ~2,570-company run has not yet happened, so its behavior under that sustained load is a tracked, not assumed-solid, risk.
- **Also read from the same page since #365 (2026-11-25), no extra request:** the **Ratios** section (debtor, inventory and payable days, cash conversion cycle, working-capital days, ROCE history) is stored as the `ratios` statement type in `financial_line_items`; the **Documents → Announcements** list (the company's recent stock-exchange filings: Regulation 30 disclosures, credit ratings, "clarification sought", auditor and director changes, litigation and penalty notices) and its **Credit ratings** links go to `company_announcements`, each given a category by rules (`app/ingestion/announcements.py`); the **Pros / Cons** box goes to `company_insights`. Served by `GET /companies/{symbol}/announcements?category=`, `/insights` and `/financials/ratios`. The announcement list is refreshed lazily at most every 6 hours (litigation and rating notices are time-sensitive), the rest on the existing cadence. Screener labels pros and cons "machine generated": they are flags to look into, not analysis. **Promoter pledge** is read from them: Screener has no pledge table and states a pledge only in its Cons ("Promoters have pledged 73.0% of their holding", seen on JP Power), so a `Promoter Pledge %` ratio is stored when that line exists. **No such row means Screener flags no pledge, not a confirmed zero** (Adani Enterprises, for one, has none); the report must say it that way. The exact figure by quarter lives in the NSE/BSE shareholding-pattern filings, which block automated access, so it is not used. Parsers are tested on the saved Newgen page; the new tables were migrated and tested on a throwaway local Postgres, and **the production migration (`a8c3d1e5f740`) is run by the maintainer**.
- **SME list (ADR 0066):** NSE's `SME_EQUITY_L.csv` when reachable, else the bundled `SME_SYMBOLS.csv` (symbol, name, series). **Yahoo quotes for SME use the series-suffixed ticker (`SYMBOL-SM.NS` / `-ST.NS`)**: the plain `SYMBOL.NS` is mostly a dead line. It gives a price, no market cap or P/E (Screener.in supplies those).
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
- **Also used by the research agent (#364, 2026-11-25):** the keyless `web_search` tool queries the same feed for the freshest headlines about a company, a case or a regulation. The feed's own notice limits it to personal, non-commercial feed-reader use; the agent runs on the signed-in user's own request and keeps only headline, outlet and date. Its links are `news.google.com` redirect pages that need JavaScript, so the page reader refuses them and the agent searches for the headline words to find the publisher's page instead.

### Regulator press-release feeds: RBI, TRAI, SEBI (research report, #365, ADR 0081)
- **Type:** public RSS
- **Used for:** retrieval material for the report's regulatory chapter. Kept items are stored in `news_items` under their own source labels (`RBI press release`, `TRAI`, `SEBI`), deduplicated by URL, indexed into the retrieval corpus, and left out of the public news feed unless `include_regulatory=true`. Sentiment is neutral (a headline's tone says nothing about a notice). They are not tagged to companies (they are sector-wide), and are kept 180 days instead of 30.
- **Endpoint(s):** `https://www.rbi.org.in/pressreleases_rss.xml`, `https://www.trai.gov.in/rss.xml`, `https://www.sebi.gov.in/sebirss.xml`
- **Auth:** none. **Cost:** free. **Rate limits:** none published; fetched with the news broad-feed refresh (at most every 30 minutes, on read), one request per feed.
- **Filter:** the feeds are mostly routine, so each source has a filter for its routine items. On 2026-11-25 RBI's 10 items were 8 auction results and money-market operations and 2 Governor meetings (2 kept); TRAI's 10 were 6 consumer-awareness workshops and administrative notices and 4 others (about 1 kept after tuning). Expect a low volume of items: the value is the occasional penalty, direction, order or consultation, not a stream.
- **Downloaded with httpx, not feedparser:** feedparser's own downloader fails TLS verification on TRAI's server (missing intermediate certificate), httpx with the certifi bundle does not. The request carries an honest `User-Agent`.
- **Checked and not used (2026-11-25):** PIB and DoT answer HTTP 403 to non-browser clients (not bypassed: see the safety rules), CCI and IRDAI publish no feed (404). SEBI's feed was an empty channel; it is kept in the list so it starts working if SEBI fills it. For anything these feeds do not carry, the research agent searches the web (see below).
- **ToS notes:** public government RSS feeds meant for syndication; only headline, summary, link and date are kept.

### Web search for the research agent (#364, ADR 0081)
- **Type:** provider-run search tools, plus a keyless fallback made of a public HTML search and a page reader
- **Used for:** facts the stored data does not hold (litigation, regulation, management and sector developments), in the research report's chapters and later in Mitra chat
- **Provider tools (no extra setup, billed by the provider to the user's own key):** Google Search grounding (Gemini), Anthropic web search (`web_search_20250305`, must be enabled for the account in the Anthropic console), OpenAI web search (`web_search`, Responses models). If a provider's tool fails, the call is repeated with the keyless tools.
- **Keyless fallback, for every other provider** (OpenRouter, Groq, Mistral, DeepSeek, xAI, Together, Cerebras, Sarvam): `web_search` queries **DuckDuckGo's HTML results** (`https://html.duckduckgo.com/html/?q=...`, direct publisher links) and Google News RSS (above); `fetch_page` reads one public page or PDF (text only).
- **Auth:** none. **Cost:** free.
- **Rate limits:** none published. Per report section the agent gets at most 6 searches and 4 page reads, an 8 s search timeout and a 10 s page timeout, so the load is small and bounded.
- **What leaves the app:** the search query only. The agent is told to use public names (companies, sectors, regulators, cases) and never the investor's holdings, amounts or notes.
- **Safety:** pages are fetched through the SSRF-safe outbound client (https only, public addresses only, every redirect hop validated again), at most 6 MB, HTML and PDF only, no cookies or logins. Titles, snippets and page text are sanitised and fenced as `<untrusted>` data, and the model is told never to follow instructions found in it. A bot-check or challenge page is not bypassed: that source is skipped and the search reports it could not be reached.
- **Also used by the Mitra chat** (#401, ADR 0082) for every provider: `web_search` and `fetch_page` with 3 searches and 2 pages per reply, behind the user's Web search switch.
- **ToS notes:** DuckDuckGo's HTML endpoint is a public page, not a documented API, so this source is best-effort and may be rate-limited or changed; the tool degrades to Google News headlines, then to an error the model can act on. The request carries an honest `User-Agent` naming MarketMitra. Reviewed 2026-11-25 against live responses (parsers are tested on recorded real samples).
- **Also checked, not yet used:** the RBI press-release feed (`https://www.rbi.org.in/pressreleases_rss.xml`) and the TRAI feed (`https://www.trai.gov.in/rss.xml`) answer with real items; SEBI's feed (`https://www.sebi.gov.in/sebirss.xml`) answered with an empty channel on 2026-11-25. They are the sources for the regulatory feed ingestion in #365.

### Chittorgarh (IPO calendar + subscription + grey-market premium)
- **Type:** scraper (Tier 3, last resort — Phase 7, [ADR 0017](./decisions/0017-ipo-tracker-gmp-scope.md))
- **Used for:** IPO calendar (dates, price band, lot size, issue size), live subscription figures, and **grey-market premium (GMP)** — none of which has a free official API. NSE/BSE public IPO endpoints are the Tier 1 attempt for the non-GMP fields; GMP is Tier 3 only.
- **Endpoint(s):** `https://www.chittorgarh.com/` IPO dashboard pages, via `scrapling`'s static parser, isolated in `services/fundamentals-api/app/ingestion/tier3_ipo_scraper/`
- **Which site, exactly:** the scraper reads **InvestorGain** (`investorgain.com`, Chittorgarh's sister site; its images come from `chittorgarh.net`), not `chittorgarh.com`: the live report `/report/ipo-gmp-live/331/` for the calendar, GMP and the overall subscription, and, since #285, each IPO's **subscription page** (`/subscription/<slug>/<id>/`, linked from the report row as `/gmp/<slug>/<id>/`) for the latest bidding day's multiples by category (QIB, NII, small NII, big NII, retail). Same method, same ToS position ([ADR 0074](./decisions/0074-ipo-category-subscription-and-odds.md)); one extra page per open or closed IPO per refresh, paced 2 s apart and capped at 15.
- **Auth:** none
- **Rate limits:** none published; scraped at most every `ipo_cache_ttl_minutes` (~60) via lazy refresh-on-read, with request pacing and a browser-like User-Agent
- **Cost:** free
- **ToS notes:** Reviewed 2026-09-06. Chittorgarh's Disclaimer & Privacy Statement (`chittorgarh.com/article/disclaimer-and-privacy-statement/238/`) states *"no user may distribute, modify, transmit, or use the contents in any manner for public or commercial purposes without prior written permission"*, and the site returns `403` to non-browser clients. This is **not a sanctioned integration** — it is an accepted known risk on the same terms as Screener.in (ADR 0011): kept in one isolated, swappable module; GMP shown only with an "unofficial grey-market estimate, not from any exchange" caveat and degrading to "unavailable" on any scrape failure; alerts on GMP skip rather than fire on missing data. If the source becomes unworkable, the module is swapped or GMP is dropped, without touching the rest of the IPO tracker.

### AMFI NAVAll (mutual fund schemes + daily NAV)
- **Type:** official public file (Phase 11 — [ADR 0067](./decisions/0067-mutual-funds-data-sourcing.md))
- **Used for:** the scheme master (code, ISINs, fund house, category, plan, option) and every scheme's latest NAV
- **Endpoint(s):** `https://portal.amfiindia.com/spages/NAVAll.txt` (the old `www.amfiindia.com/spages/NAVAll.txt` redirects here), semicolon-separated text; parsed by `services/fundamentals-api/app/ingestion/mf_amfi.py`
- **Auth:** none. **Rate limits:** none published; fetched once a day by `refresh-funds`. **Cost:** free
- **ToS notes:** AMFI publishes this file for public use; we send a descriptive User-Agent and do not spoof a browser.

### mfapi.in (mutual fund NAV history)
- **Type:** free community API over AMFI data (ADR 0067), used for **backfill only**
- **Used for:** full NAV history per scheme (`GET https://api.mfapi.in/mf/{scheme_code}`), parsed by `app/ingestion/mf_mfapi.py`
- **Auth:** none. **Rate limits:** none published; the job paces itself (~0.4 s between schemes). **Cost:** free
- **ToS notes:** a third-party service with no SLA. All history is copied into `mf_nav`, so downtime only delays a backfill.

### India mutual fund TER tracker (expense ratios, community dataset)
- **Type:** community-maintained CSV on GitHub, MIT licence ([ADR 0067](./decisions/0067-mutual-funds-data-sourcing.md)); republishes AMFI's TER disclosure
- **Used for:** each fund's total expense ratio, Regular and Direct plan
- **Endpoint(s):** `https://raw.githubusercontent.com/captn3m0/india-mutual-fund-ter-tracker/main/data.csv` (and the GitHub commits API for the file's update date), parsed by `app/ingestion/mf_ter.py`; matched to schemes by normalised name
- **Auth:** none. **Rate limits:** one raw download plus one GitHub API call a day from `refresh-funds` (GitHub's unauthenticated API allows 60 an hour). **Cost:** free
- **ToS notes:** MIT, so reuse is allowed with the licence notice (credited here and in the ADR). Not an official AMFI feed and has no SLA; the stored `as_of` is the tracker's last commit, so staleness is visible. AMFI's own JSON endpoint is not used (it needs browser-style headers).

### GitHub REST API (this repository)

- **Type:** public API
- **Used for:** the landing open-source panel and `GET /api/github/repo` (stars, contributor count, SPDX licence, latest release tag for `AnkushGitRepo/marketmitra`)
- **Endpoint(s):** `GET https://api.github.com/repos/AnkushGitRepo/marketmitra`, `GET .../contributors?per_page=1` (the `Link` `rel="last"` page is the count), `GET .../releases/latest`
- **Auth:** none required. `GITHUB_TOKEN` is optional and only raises the rate limit. The request sends a `User-Agent` and `X-GitHub-Api-Version: 2022-11-28`.
- **Rate limits:** 60 requests per hour per IP without a token; 5,000 per hour with one. The app caches the three calls for one hour.
- **Cost:** free
- **ToS notes:** official public API for a public repository. A failed or missing field stays null and the page shows an em dash.

### Yahoo Finance: metal futures, USD/INR and NSE gold and silver ETFs (candidate, #446)
- **Type:** public API through the `yahoo-finance2` library already in the app (ADR 0024)
- **Used for:** *not wired yet.* Candidate source for gold, silver and platinum prices in INR, and for the NSE gold and silver ETFs.
- **Endpoint(s):** `quote` and `chart` for `GC=F` (gold, USD per troy ounce), `SI=F` (silver, USD per ounce), `PL=F` (platinum, USD per ounce), `USDINR=X`, and the ETFs `GOLDBEES.NS`, `GOLDIETF.NS`, `HDFCGOLD.NS`, `SILVERIETF.NS`, `HDFCSILVER.NS`, `SBISILVER.NS`, `TATSILV.NS`, `SILVERBEES.NS`. Checked 2026-11-27: all returned a price, 52-week range and a time; `GC=F` returned 262 weekly bars over five years. `SETFGOLD.NS` returned nothing.
- **Auth:** none
- **Rate limits:** unofficial; the same per-request caching as the existing quotes applies
- **Cost:** free
- **ToS notes:** unofficial endpoint, the same standing as the existing quote use (ADR 0024). Prices are **international futures converted at the USD/INR rate**: they are not the Indian retail or IBJA price, which adds import duty, GST and local premium. Any use must say so. No Indian premium is guessed.

### IBJA (India Bullion and Jewellers Association) benchmark rates (rejected, #446)
- **Type:** web page and a subscription API
- **Used for:** nothing. Considered for the Indian spot benchmark (gold 999/916 per 10 g, silver 999 per kg, platinum, AM and PM fixings).
- **Endpoint(s):** `https://ibjarates.com` (page); the official API is advertised at `indiagoldratesapi.com`.
- **Auth:** the API is subscription-only (contact addresses are on the IBJA site).
- **Cost:** the API is a paid subscription, which the project rules out (ADR 0011, 0016).
- **ToS notes:** reviewed 2026-11-27. The page says "© India Bullion and Jewellers Association Ltd. All Rights Reserved", that use beyond fair use needs the owner's permission, that rates are "for general information purposes only", and that anyone using them for valuation or financial products should use the official API. Reading the page would be copying a copyrighted benchmark without a licence, so it is not used. If the maintainer obtains written permission or a free licence, revisit.

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
