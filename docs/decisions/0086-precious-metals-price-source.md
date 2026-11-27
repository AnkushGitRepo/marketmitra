# 0086 — Precious metals: where the prices come from

Status: accepted (2026-11-28, issue #446). The maintainer asked for an accurate Indian gold price and said Yahoo is fine for the rest; the amendment below records the accuracy check.

## Context

The maintainer asked for Indian gold, silver and platinum: spot cards and a gold/silver ratio on Markets, an NSE gold and silver ETF table, physical bullion holdings on `/portfolio`, and a Mitra tool. The brief suggested IBJA rates, MCX or Metals-API. The project allows free sources only (ADR 0011, 0016).

## Options

| Source | What it gives | Verdict |
|---|---|---|
| **Yahoo (`yahoo-finance2`)**: `GC=F`, `SI=F`, `PL=F`, `USDINR=X`, NSE ETFs | Live price, 52-week range and years of history for all three metals and seven of the eight listed ETFs. Already in the stack. | **Chosen.** Free, no new infrastructure. With the import duty applied it tracks the Indian gold rate within 0.1% on the day checked. |
| **IBJA** page or API | The real Indian benchmark, twice a day. | **Rejected.** All rights reserved; use beyond fair use needs permission; the official feed is a paid subscription. |
| Metals-API, MCX feeds | Spot and futures. | **Rejected.** Paid. |

## Decision

Use Yahoo for everything, and be plain about what it is:

- Compute the **Indian parity price**: futures price x USD/INR / 31.1035 g per troy ounce, then x (1 + import duty), per 10 g for gold, per kg for silver, per gram for platinum. The import duty is a **dated constant** in code (15% since 13 May 2026: 10% basic duty and 5% AIDC, Customs Notification 16/2026; it was about 6% before), like the tax rates in `lib/tax/india.ts`, and must be edited when it changes. Never label the figure "IBJA", "MCX" or "today's rate in your city": call it an estimate that tracks the Indian benchmark.
- **GST is not in the figure.** The GST toggle applies a stated 3% on top and says so. Making charges and local premium are not included.
- **22K is a purity ratio of 24K** (916/999), shown as an estimate, not a market quote.
- ETFs (`GOLDBEES`, `GOLDIETF`, `HDFCGOLD`, `SILVERIETF`, `HDFCSILVER`, `SBISILVER`, `TATSILV`, `SILVERBEES`) are ordinary NSE quotes through the existing pipeline. `SETFGOLD.NS` returned nothing and is left out. Expense ratio and AUM are not in the quote and need a separate source; the table would omit them until one is chosen.
- A missing price or conversion rate shows an em dash, never an estimate.

## Build order (each its own PR)

1. `/api/commodities` and its pure conversion maths (tested), cached 15 minutes, documented in OpenAPI.
2. Markets "Bullion" tab: spot cards, gold/silver ratio, normalised chart, ETF table.
3. Mitra read-only tool.
4. Physical bullion holdings (grams and purity) on `/portfolio` and a Precious metals slice in the allocation donut. This changes the holding model and the totals, so it needs its own design note first.

## Consequences

- The app shows an estimate of the Indian benchmark, not the benchmark itself, unless IBJA grants permission or a licence.
- The Yahoo source is unofficial, with the same standing as the existing quotes.

## Amendment: accuracy check (2026-11-28)

The maintainer needs the gold price to be accurate for India. Comparing the Yahoo price, converted and with the 15% duty, with IBJA's published rates (which exclude GST) at one moment on 2026-11-27: **gold 999 was within 0.1%** (about Rs 126,167 against Rs 126,299 per 10 g). **Silver was about 2.6% under and platinum about 5.5% under**, because their local premiums are larger. So:

- Gold is shown as an estimate that tracks the IBJA rate closely; silver and platinum carry an extra note that the Indian rate is usually higher.
- This is **one comparison, not a guarantee.** The premium moves with demand and the duty changes with the Budget. The IBJA figures themselves are not copied, stored or shown; they were read once to test the formula.
- The provider is pluggable. If the maintainer gets written permission or a free licence from IBJA, its AM and PM rates can replace the estimate for gold without changing the screens.
- The 15% duty and the date it took effect come from news reports and notification text found by web search, not from the CBIC site; **the maintainer should confirm the rate** (as with the tax constants).
