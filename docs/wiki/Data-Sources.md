# Data Sources

Where MarketMitra's data comes from. The authoritative registry — with endpoints, auth, rate limits and terms-of-service notes for each source — is [`docs/data-sources.md`](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/data-sources.md). This page is the summary.

## Policy

1. **Free sources only.** No paid data vendor, ever — there is no paid tier to fund one ([ADR 0011](Decision-Records)).
2. **Public APIs first.** Scraping is the last resort, and a terms-of-service review happens *before* building one, not after.
3. **Be honest about the trade-off.** Several sources are unofficial and could change or block us. They are kept in isolated, swappable modules, and a failure degrades to "unavailable" instead of a made-up number.

## Sources

| Source | Provides | Kind | Notes |
| --- | --- | --- | --- |
| **NSE** public endpoints | quotes, corporate actions, shareholding, XBRL results, the listed-company CSVs | unofficial API | Needs a browser-style session handshake; NSE's edge can block datacenter IPs. ~3 req/s etiquette. |
| **BSE** public endpoints (`bsedata`) | quotes, annual-report PDFs | unofficial API | Same caveat as NSE; verified working when NSE was blocked. |
| **Yahoo Finance** (`yfinance`, `yahoo-finance2`) | live quotes, price history, indices; the daily bulk quotes for the screener | unofficial API | The only viable source for index-level and intraday data. |
| **Screener.in** | ratios, statements, shareholding fallback, screener fundamentals | scraper (Tier 3) | Terms don't sanction automated collection; accepted risk, isolated module. |
| **Chittorgarh** | IPO calendar, subscription, grey-market premium | scraper (Tier 3) | Not a sanctioned integration; GMP is always labelled an unofficial estimate. |
| **News RSS** (ET Markets, LiveMint, BusinessLine, Moneycontrol) | the markets news stream | RSS | Only headline, short summary, time and link are stored — never article bodies. |
| **Google News RSS** | per-company news | RSS | One query per tracked company; same storage rule. |
| **`bge-small-en-v1.5`** (via `fastembed`) | retrieval embeddings | open-weights model | Served from the data service's `/embed`; not a third-party runtime data source. |

## What this means in practice

- Data can be **slightly stale or occasionally missing** when a free source is slow or blocks us. The UI shows a dash or "unavailable" rather than inventing a value.
- Figures from different sources can **disagree** (for example Yahoo's market cap versus Screener.in's consolidated numbers). Each record says where it came from (`source_tier`).
- Grey-market premium is **not from any exchange**. Treat it as a rumour index.

## Adding a source

Open an issue first. A new source needs: why no free official API will do, the endpoint, auth, rate limits, cost and — for a scraper — a terms review. Then update `docs/data-sources.md` in the same pull request. See the [Development Guide](Development-Guide).
