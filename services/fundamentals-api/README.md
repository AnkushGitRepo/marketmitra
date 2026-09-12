# MarketMitra Fundamentals API

The screener.in-style data service: ratios, historical financial statements
(P&L, balance sheet, cash flow), shareholding pattern, company documents,
and the price history behind them — for Indian-listed companies. Sourced
entirely from free, public data via a three-tier fallback chain (see
[ADR 0011](../../docs/decisions/0011-three-tier-fundamentals-data-sourcing.md)).
No paid vendor, no API key required to run this service.

Python + FastAPI, deliberately separate from the main Next.js app — see
ADR 0011 for why this needed an explicit, scoped exception to
[ADR 0004](../../docs/decisions/0004-nextjs-api-routes-as-backend.md).

## Stack

- FastAPI (async), served with uvicorn
- PostgreSQL via SQLAlchemy (async) + asyncpg, migrations via Alembic
- pydantic v2 for validation, polars available for heavier tabular work,
  httpx for concurrent requests, orjson for fast response serialization
- Ingestion: `nsepython` / `bsedata` (Tier 1), `yfinance` (Tier 2),
  `scrapling` against Screener.in (Tier 3, isolated —
  see `app/ingestion/tier3_screener_scrapling/README.md`)

## Setup

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

createdb marketmitra_fundamentals   # or point DATABASE_URL at any Postgres

cp .env.example .env                # defaults work against a local Postgres

alembic upgrade head
```

## Running

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8420
```

`GET /health`, then e.g. `GET /companies/RELIANCE` (includes `about`),
`/companies/RELIANCE/ratios`, `/companies/RELIANCE/financials/profit_and_loss`,
`/companies/RELIANCE/shareholding`, `/companies/RELIANCE/peers`,
`/companies/RELIANCE/prices`, `/companies/RELIANCE/documents` (annual
reports, BSE-hosted PDFs), `GET /indices` (real NIFTY 50/SENSEX/
NIFTY BANK/INDIA VIX quotes, live via yfinance — not company-keyed, not
cached), `GET /quote?symbols=A,B,C` (batched live quote — last price,
previous close, intraday % change, 52-week high/low — for N symbols at
once, see "Live quote" below), `GET /news` (markets news feed, optional
`?symbols=A,B,C` filter — see "News feed" below), `GET /ipos` (IPO
calendar + subscription + GMP, optional `?status=` filter — see "IPO
tracker" below), and `GET /search?q=`
(search across all ~2,570 NSE-listed equities plus the tracked indices —
see "Company search" below). Every company response that can come from
more than one tier carries a `source_tier` field.

## Company search (`GET /search?q=`)

Backed by a `company_master` table (`app/ingestion/company_master.py`),
populated from NSE's own published equity list at
`archives.nseindia.com/content/equities/EQUITY_L.csv` — confirmed reachable
even though `www.nseindia.com` is blocked in this project's dev environment
(see the Tier 1 module's docstring). Same accepted unofficial-access
trade-off as the rest of Tier 1 (ADR 0011). Lazily populated on first
search call (a few thousand rows, fast); not part of the three-tier
per-company fallback chain since it's a lookup table, not company data.

## News feed (`GET /news`)

`app/ingestion/news.py` + `app/services/news_service.py` +
`app/api/routes/news.py` (ADR 0015). Free RSS only, two sources:

- **Broad Indian-markets RSS** (Economic Times, LiveMint, BusinessLine,
  Moneycontrol) → the global stream. Company tagging is
  best-effort: an item is tagged with a symbol only when that company's
  distinctive multi-word name appears whole (word-bounded) in the
  headline/summary — short or single-word names (ITC, MRF, Infosys) are
  deliberately not matched, to keep precision high. Untagged items are
  normal and still appear in the global feed.
- **Google News RSS, one query per company name** (`"<name>" NSE`) → the
  stock-detail and portfolio views. The symbol tag is exact by
  construction. Runs for every held symbol plus a curated tracked set
  (`news_service.TRACKED_SYMBOLS`).

Stored in Postgres (`news_items` deduped on URL + `news_item_symbols`),
**lazy TTL refresh-on-read** like ratios/prices
(`news_broad_cache_ttl_minutes` / `news_symbol_cache_ttl_minutes`), 30-day
retention (`news_retention_days`). We keep title + summary + link +
published-at only — **no article bodies are fetched or scraped**. Each
item carries a VADER **headline-tone** label (`positive|neutral|negative`
+ score) — not an analyst rating or a trading signal; generic-lexicon
sentiment on financial headlines skews optimistic, a known limitation
(a finance lexicon layer is a possible follow-up).

`GET /news?limit=&cursor=` → `{ items: [{ url, title, summary, source,
published_at, sentiment, sentiment_score, symbols[] }], next_cursor }`,
newest first, keyset-paginated. `GET /news?symbols=A,B,C` filters to items
tagged with any of those symbols.

`refresh_all()` exists for an optional warm-up cron; reads don't need it.

## IPO tracker (`GET /ipos`)

`app/ingestion/tier3_ipo_scraper/` + `app/services/ipo_service.py` +
`app/api/routes/ipos.py` (ADR 0017). IPO calendar, live subscription
figures, and **grey-market premium (GMP)** — none of which has a free
official API — scraped from one aggregator (InvestorGain's Live IPO GMP
report), in an isolated swappable module. **GMP is an unofficial
grey-market estimate, not from any exchange and not a prediction** — every
surface labels it so, and it degrades to "unavailable" on any scrape
failure.

The aggregator page is a client-rendered SPA, so live ingestion runs out
of band: a scheduled headless-browser job renders the page, parses it with
this module, and `POST`s the rows to `/ipos/ingest` (guarded by
`ipo_ingest_token`). Ingest is **update-first**: each row upserts on
`slug` (`ON CONFLICT DO UPDATE`), so an existing IPO is refreshed in place
and a new row is only created for a slug never seen before. `GET /ipos`
only reads Postgres; an IPO row is deleted once its listing date is more
than `ipo_listed_retention_days` (10) in the past.

`GET /ipos?status=upcoming|open|closed|listed` (omit for all) → rows with
`{ slug, name, source_url, category (mainboard|sme), status, price,
ipo_size_cr, lot_size, rating, subscription_times, anchor, gmp, gmp_pct,
gmp_low, gmp_high, gmp_updated_at, open_date, close_date, allotment_date,
listing_date, source_tier, fetched_at }`, ordered open → upcoming →
closed → listed.

## Live quote (`GET /quote?symbols=A,B,C`)

`app/ingestion/quotes.py` + `app/api/routes/quote.py`. Called both directly
(by MarketMitra's alerts engine, ADR 0014) and as the fallback behind the
main Next.js app's own `yahoo-finance2` primary source (ADR 0024) — a
lightweight "price right now, for these N symbols" call so a caller fetches
every symbol it needs in one request. As of ADR 0024, this endpoint tries
NSE (`app/ingestion/tier1_nse_bse.py`'s `get_nse_quote`) first, then BSE
(`get_bse_quote`, needs a `bse_code` looked up in Postgres — currently a
stub, since nothing populates `bse_code` yet), and returns nothing if both
come up short. **yfinance has been removed from this path entirely** — a
caller gets a real exchange-sourced price or none at all. Response per
symbol: `{ symbol, price, prev_close, change_pct, week52_high, week52_low,
as_of, source_tier }` (`source_tier` is `tier1_nse_bse` here — always Tier 1,
since yfinance is gone). A tracked index name (e.g. `NIFTY 50`) also
resolves. Symbols whose upstream fetch fails are omitted from the response,
never returned with a fabricated price. Results are held in a short
in-process TTL cache (`quote_cache_ttl_seconds`, default 60) so callers
share one upstream hit. Capped at 100 symbols/request.

## Testing

```bash
pytest
```

All 102 tests run offline — no network, no database. They use saved
fixtures (a real Screener.in page a maintainer saved to disk, a synthetic
but taxonomy-accurate XBRL instance document, a generated PDF with a ruled
table, and JSON shapes for the NSE/BSE filing-list responses) rather than
live calls, so they're deterministic and don't depend on
Screener.in/NSE/BSE/Yahoo staying reachable or unchanged.

## Rate limiting (`KV_REST_API_URL` / `_TOKEN`, or `UPSTASH_REDIS_REST_*`)

A fixed-window per-client-IP limiter (`app/rate_limit.py`, ADR 0019),
applied as HTTP middleware to every route except `/health`. It's a **no-op
pass-through** unless both Upstash env vars are set, so local dev and
self-host are never throttled. On the hosted deployment, point these at the
same Upstash Redis instance the main app uses (`vercel integration add
upstash/upstash-kv` on this project too, or copy the two vars across).
`RATE_LIMIT_PER_MINUTE` defaults to 120. Fails open — a limiter error never
takes a request down. Uses `httpx` (already a dependency); no `redis`
package.

## Current real coverage (stated plainly, not aspirationally)

| Data | Primary | Fallback | Status |
|---|---|---|---|
| Quote / company info | Tier 1 (BSE via `bsedata`; NSE via `nsepython`) | Tier 2 (`yfinance`) | Both wired and tested. NSE itself is frequently blocked at Akamai's edge (see `app/ingestion/tier1_nse_bse.py`) — this is exactly why Tier 2 exists. |
| Price history | Tier 2 (`yfinance`) | — | Wired and tested. |
| Live quote (`GET /quote`) | Tier 1 NSE (`nsepython`) | Tier 1 BSE (`bsedata`, needs a `bse_code` — currently a stub, nothing populates one yet) | ADR 0024. Batched, 60s in-process cache. Last price / prev close / intraday % / 52-week range. Feeds MarketMitra's alerts engine (ADR 0014) and, as a fallback behind `yahoo-finance2`, the main app's dashboard. yfinance removed from this path entirely — never a `fast_info` guess. |
| IPO tracker (`GET /ipos`) | Tier 3 (aggregator scrape) | Tier 1 NSE/BSE IPO endpoints (attempt) | ADR 0017. IPO calendar + subscription + **GMP** (no free official source for GMP). Parser verified against a maintainer-saved page (23 real IPOs); live ingestion is an out-of-band headless-browser job (SPA page). GMP labelled everywhere as an unofficial grey-market estimate; degrades to "unavailable". |
| News feed (`GET /news`) | Free RSS — broad markets feeds + Google News RSS per symbol | — | ADR 0015. Postgres-backed, lazy TTL refresh, 30-day retention. Verified live: 4 broad feeds return real items (Business Standard 403s; NDTV Profit's feed carries too much non-markets content — both dropped), Google-News-per-symbol returns real publisher-attributed items. VADER headline-tone label per item (skews optimistic on financial text — labelled as tone, not a signal). Title + summary + link only, no scraped bodies. |
| Ratios | Tier 3 (Screener.in) | — | Tiers 1/2 don't expose comparable named/computed ratios as raw data. |
| Shareholding pattern | Tier 1 (direct NSE endpoint) | Tier 3 (Screener.in) | Tier 1's response shape is unverified (NSE blocked during development); Tier 3 is verified against two real companies and captures full quarterly history (typically 12 quarters), not just the latest. |
| Financial statements (P&L/BS/CF) | Tier 1 (NSE/BSE results filing) for the latest period | Tier 3 (Screener.in) for the history, and the fallback | `filing_discovery.py` finds the most recent NSE `/api/corporates-financial-results` filing (BSE `AnnGetData` fallback), then `xbrl_parser` / `pdf_financials` extract it. NSE fetch is unverified from a blocked environment (parsers are fixture-tested); every failure collapses to "Tier 1 had nothing", so Tier 3 still serves and there's no regression. `financials_tier1_enabled` flag. |
| About (business description) | Tier 3 (Screener.in) | — | Backfilled once per company and cached indefinitely (not TTL-refreshed) — the text rarely changes. |
| Peer comparison | Tier 3 (Screener.in) | — | Screener lazy-loads this table via AJAX far more often than server-rendering it inline (confirmed for large caps and mid-caps alike). Reads Screener's own JS to find the real endpoint (`/api/company/{warehouse_id}/peers/`, keyed by a different internal id than the one shown in the page's own HTML attributes at first glance) rather than guessing — verified working for Reliance, TCS, and Newgen. |
| Documents (annual reports) | Tier 3 (Screener.in) | — | Screener's Documents section links directly to BSE-hosted PDFs — only annual reports are populated. Other document types (credit ratings, etc.) aren't wired; the `filing_discovery` module could be extended to cover them. |

See `app/services/fundamentals_service.py`'s module docstring for the same
detail in code, and ROADMAP.md's Phase 4 checklist for what's tracked as
still open.
