# 0067 — Mutual funds: data sourcing and architecture

Status: accepted · Date: 2026-11-18 · Issue: #220 · Builds on [0011](./0011-three-tier-fundamentals-data-sourcing.md), [0017](./0017-ipo-tracker-gmp-scope.md)

## Context

MarketMitra covers stocks, indices, IPOs and news but nothing on mutual funds. Users want the Indian fund universe, past and current
performance, ratios, categories and a screener. There is no free official "fund API", so the question is where each field comes from
and where the work runs. The no-paid-tier rule ([0011](./0011-three-tier-fundamentals-data-sourcing.md), [0016](./0016-landing-page-no-paid-tier-reconciliation.md)) applies.

## Decision

**Sources, by field:**

| Field | Source | Notes |
|---|---|---|
| Scheme master (code, ISINs, fund house, category, plan, option) and latest NAV | AMFI `NAVAll.txt` (`portal.amfiindia.com/spages/NAVAll.txt`) | Official, daily, no key. ~14.5k rows incl. dormant schemes. |
| NAV history | mfapi.in `/mf/{code}` (backfill only) | Free community mirror of AMFI data, no SLA. Everything is copied into our own table, so an outage only delays a backfill. |
| Returns (1M–10Y, CAGR from 1Y), SIP XIRR, std dev, Sharpe, Sortino, max drawdown | **Computed by us** from NAV history | Pure functions (`app/services/mf_metrics.py`); `null` when history is too short, never estimated. Fixed risk-free rate (6.5%) so every fund is judged alike. |
| Expense ratio, AUM, exit load, manager, benchmark | Disclosed data, stored in `mf_factsheet` with `source` and `as_of` per row | See "Open" below. |

**Where it runs.** Postgres (Neon) via the fundamentals service, like IPOs. Thousands of upstream requests do not belong in a serverless
request, so a GitHub Actions job (`.github/workflows/refresh-funds.yml`, `scripts/refresh_funds.py`) downloads and parses, then POSTs to
token-guarded `/funds/ingest/*` routes (`MF_INGEST_TOKEN`, fail-closed). The service only reads and validates (Pydantic, row caps).

**Scope.** The screener and detail pages cover *active* schemes (latest NAV within 10 days of the newest NAV in the file); dormant
ones stay reachable by direct link. NAV history and metrics are kept for **Direct-Growth** plans only (the comparable form); other
plans keep the latest NAV. Categories are normalised across AMFI's two spellings (`Equity Scheme` / `Equity Schemes`) into
Equity / Debt / Hybrid / Solution Oriented / Other (index funds, ETFs, fund-of-funds).

**Unit splits.** ETFs split and consolidate units (UTI Gold ETF fell 99% in one day in 2021, a 1-for-100 split), which reads as a crash. Before
any metric is computed, a single-day NAV move beyond 40% is treated as a unit change (no return that day) and the series is rebuilt from the
cleaned daily returns. The NAV chart still shows the raw stored NAVs, so a split appears there as a step. Limitation: a real >40% one-day loss
(for example a segregated portfolio) is neutralised the same way.

**Guardrails.** Returns are shown with a past-performance notice; no "best fund" or "buy" wording; Mitra's no-advice default is unchanged.

## Open

AMFI's TER page is fed by `www.amfiindia.com/api/populate-te-rdata-revised`, but a plain request without browser-style headers is not served
the JSON. The project rule is not to bypass bot checks, so **expense ratio / AUM ingestion is not wired to a source yet**: the
`/funds/ingest/factsheet` route, table and UI are ready, and the detail page shows "not available" until data exists. The maintainer
decides the source (an AMC-published file, or a community TER dataset reviewed for licence and freshness).

## Consequences

- New tables `mf_schemes`, `mf_nav`, `mf_metrics`, `mf_factsheet` (migration `e5b1c9a07d33`) and a new secret `MF_INGEST_TOKEN`
  (Secret Manager `fundamentals-mf-ingest-token` for the Cloud Run service + the GitHub Actions secret; both deploy scripts know it).
- Storage: ~1.8k Direct-Growth schemes x up to ~10 years of NAVs is a few million rows; check the Neon plan before a full backfill.
- Metrics are recomputed from stored NAV, so a methodology change is a recompute, not a re-download.
