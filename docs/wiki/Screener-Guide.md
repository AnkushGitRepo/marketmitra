# Screener Guide

The screener filters the NSE universe (about 2,600 main-board companies) by size, valuation, profitability, leverage and growth. Open it at `/screener`, or ask [Mitra](Mitra-Assistant) to build a screen for you.

## Filtering

**Company or symbol** — a contains-match on name or symbol.

**Sector and industry** — the industry list narrows to the sector you pick. Options show how many companies each holds, and only exist for companies whose fundamentals have been collected (see below).

**Range filters** — each takes an optional minimum and maximum:

| Group | Field | Notes |
| --- | --- | --- |
| Size | Market cap | ₹ crore |
| Valuation | P/E, P/B | loss-makers and negative book values carry no value, so they never match "P/E under 20" |
| Valuation | Dividend yield | % |
| Profitability & leverage | ROE, ROCE | % |
| Profitability & leverage | Debt / equity | ratio |
| Growth | Sales growth, Profit growth | 3-year CAGR, % |

Percentages are plain numbers: `15` means 15 %.

## Quick screens

One click sets a sensible starting point — adjust it afterwards.

| Screen | Criteria |
| --- | --- |
| Quality compounders | ROE and ROCE ≥ 15 %, debt/equity ≤ 0.5 |
| Value picks | P/E 1–15, P/B ≤ 2 |
| Dividend payers | Dividend yield ≥ 3 % |
| High growth | Sales and profit growth ≥ 20 % (3y CAGR) |
| Low debt | Debt/equity ≤ 0.1, ROE ≥ 10 % |
| Large caps | Market cap ≥ ₹50,000 Cr |
| Small caps | Market cap ₹500–5,000 Cr |

## Working with results

- **Sort** by any numeric column; sorting runs over *all* matches, not just the rows on screen.
- **Page** through results (25, 50, 100 or 200 per page).
- **Remove a filter** by clicking its chip under the form, or **Clear all**.
- **Download CSV** exports *every* matching row (not just the visible page) with units in the headers.
- **Share a screen** by copying the URL — filters, sort and page are all in it, so a link or a reload restores the exact view.
- Click a company to open its stock page.

A dash (—) means the figure isn't available yet. It does not mean zero.

## How the data is kept fresh

Two sources, each refreshed at its own natural rhythm:

| Fields | Source | Refresh |
| --- | --- | --- |
| Market cap, price, P/E, P/B, dividend yield | Yahoo Finance, in batches of 100 symbols | every weekday after the NSE close, for **every** listed company |
| ROE, ROCE, debt/equity, growth, sector, industry | Screener.in | incrementally — each run refreshes the ~400 companies with the oldest or missing data, so the whole universe cycles about weekly |

Consequences worth knowing:

- Price and valuation filters see the whole market straight away.
- **ROE, ROCE, debt, growth and sector filters only match companies whose fundamentals have been collected so far.** The page shows the coverage ("Fundamentals available for N of M companies"). A company missing from a growth screen may simply not have been scraped yet.
- Fundamentals change quarterly, which is why a weekly cycle is enough.

The operator-side detail (schedules, backfill, tokens) is in the [Operations Runbook](Operations-Runbook).

## On your own machine

A clone does not receive the hosted screener table. With both services running, set one throwaway `SCREENER_INGEST_TOKEN` to the same value in `.env.local` and `services/fundamentals-api/.env` (see `.env.example` there). It must not be the production secret.

Quotes, about a minute. Omit the header when `CRON_SECRET` is empty.

```bash
curl -X POST http://localhost:3000/api/cron/refresh-screener-quotes \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Clear all** then lists every quoted company. The first screen stays “market cap at least ₹5,000 Cr” until 300 companies have fundamentals.

Fundamentals, about 55 minutes, from `services/fundamentals-api`:

```bash
FUNDAMENTALS_API_URL=http://localhost:8420 \
SCREENER_INGEST_TOKEN=<the same throwaway value> \
.venv/bin/python scripts/refresh_screener_universe.py
```

Afterwards the opening screen is ROE at least 15% and debt/equity at most 1. `curl localhost:8420/screener/stats` shows how far the fill has got. A stopped run is safe to repeat. Keep it fresh with the quote command on weekdays and `scripts/refresh_screener_universe.py --stale-first --limit 400` about once a day. The same steps are in [Getting Started](Getting-Started#6-fill-the-screener).

## Limits to keep in mind

- A screen filters on **past** figures. It finds companies that *have* grown or look financially sound, not companies that *will*. It is a way to build a research shortlist, not a buy list.
- Growth CAGRs can be extreme for companies that started from a tiny profit. Check the base before trusting a very high number.
- A screen takes one sector at a time.
- Yahoo's P/E and market cap can differ from Screener.in's consolidated figures.

## Via the API

`GET /api/screener` (filters, sort, paging, `X-Total-Count` header), `GET /api/screener/facets`, and `GET /api/screener/export` (CSV). Details: [API and MCP](API-and-MCP).
