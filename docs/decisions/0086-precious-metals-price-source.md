# 0086 — Precious metals: where the prices come from

Status: proposed (2026-11-28, issue #446). Research only; no feature code is merged until the maintainer approves.

## Context

The maintainer asked for Indian gold, silver and platinum: spot cards and a gold/silver ratio on Markets, an NSE gold and silver ETF table, physical bullion holdings on `/portfolio`, and a Mitra tool. The brief suggested IBJA rates, MCX or Metals-API. The project allows free sources only (ADR 0011, 0016).

## Options

| Source | What it gives | Verdict |
|---|---|---|
| **Yahoo (`yahoo-finance2`)**: `GC=F`, `SI=F`, `PL=F`, `USDINR=X`, NSE ETFs | Live price, 52-week range and years of history for all three metals and seven of the eight listed ETFs. Already in the stack. | **Recommended.** Free, no new infrastructure. It is the international price in INR, not the Indian retail price. |
| **IBJA** page or API | The real Indian benchmark, twice a day. | **Rejected.** All rights reserved; use beyond fair use needs permission; the official feed is a paid subscription. |
| Metals-API, MCX feeds | Spot and futures. | **Rejected.** Paid. |

## Recommendation

Use Yahoo for everything, and be plain about what it is:

- Show **"International price in INR"**, computed as futures price x USD/INR x grams per troy ounce (31.1035), per 10 g for gold, per kg for silver, per gram for platinum. Never label it "IBJA", "MCX" or "today's rate in your city".
- **No duty, premium or GST is guessed into the figure.** The GST toggle in the brief applies a stated 3% on top and says so. The real Indian price is usually higher by import duty and local premium, and the card says it can differ.
- **22K is a purity ratio of 24K** (916/999), shown as an estimate, not a market quote.
- ETFs (`GOLDBEES`, `GOLDIETF`, `HDFCGOLD`, `SILVERIETF`, `HDFCSILVER`, `SBISILVER`, `TATSILV`, `SILVERBEES`) are ordinary NSE quotes through the existing pipeline. `SETFGOLD.NS` returned nothing and is left out. Expense ratio and AUM are not in the quote and need a separate source; the table would omit them until one is chosen.
- A missing price or conversion rate shows an em dash, never an estimate.

## If approved: build order (each its own PR)

1. `/api/commodities` and its pure conversion maths (tested), cached 15 minutes, documented in OpenAPI.
2. Markets "Bullion" tab: spot cards, gold/silver ratio, normalised chart, ETF table.
3. Mitra read-only tool.
4. Physical bullion holdings (grams and purity) on `/portfolio` and a Precious metals slice in the allocation donut. This changes the holding model and the totals, so it needs its own design note first.

## Consequences

- The app will not show the Indian benchmark unless IBJA grants permission or a licence; that is the main gap against the brief.
- The Yahoo source is unofficial, with the same standing as the existing quotes.
