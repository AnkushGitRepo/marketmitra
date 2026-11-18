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
| Expense ratio, AUM, exit load, manager, benchmark | Disclosed data, stored in `mf_factsheet` with `source` and `as_of` per row | Expense ratio: see "Expense ratio" below (community tracker). AUM, exit load, manager, benchmark: no source yet. |

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

## Expense ratio: the community TER tracker (decided by the maintainer, 2026-11-18)

AMFI's own TER page is fed by `www.amfiindia.com/api/populate-te-rdata-revised`, but a plain request without browser-style headers is not served the
JSON, and the project rule is not to bypass bot checks. So the expense ratio comes from
[captn3m0/india-mutual-fund-ter-tracker](https://github.com/captn3m0/india-mutual-fund-ter-tracker): a **MIT-licensed** CSV that republishes AMFI's TER
disclosure (same fields, "Total TER" per Regular and Direct plan), refreshed several times a day (last commit 2026-11-18 when adopted; ~2,190 rows).

- **Keyed by name, not AMFI code.** The file uses NSDL scheme codes, so rows are matched to our schemes by **normalised name** (case, punctuation and `&` ignored)
  against the scheme's base name. Measured on adoption day: **1,777 of 1,793 active Direct-Growth schemes (99.1%)** got a figure; the rest are mostly fixed-maturity plans and ETFs the file names differently.
- **Conservative on purpose.** A figure is only stored when the match is unambiguous: a name that appears twice in the file is dropped; the same name under two different
  fund houses is skipped; a value that is not above 0 and at most **4%** is "no figure" (real figures reach ~3.96% for small fund houses' Regular plans; about 20 rows above 4%
  are source errors, for example index funds at 8-11%). An unmatched fund keeps "not available", never zero. A fund's TER applies to every scheme of that plan (Growth and each IDCW variant;
  liquid funds list daily, weekly and monthly IDCW options of one fund). ETFs have one plan, which the file lists under Regular (Direct is `0.0`), so an ETF with
  no figure for its own plan uses the Regular one.
- **Attribution and freshness.** Stored with `source = "AMFI TER via community tracker"` and `as_of` = the date of the tracker's latest commit to `data.csv`, and shown beside the figure.
- **Safety.** The CSV is parsed as data and never executed; the download is size-capped (5 MB); the service refuses a file with fewer than 500 rows (a bad download must not wipe
  the table), and a figure this source wrote earlier for a scheme that no longer matches is cleared.
- **Not covered:** AUM, exit load, manager and benchmark still have no source (the same file has none of them); the screener's AUM column stays "not available".
- **Risk:** a community project with no SLA. If it stops updating, `as_of` goes stale and is visible; swapping the source touches only `app/ingestion/mf_ter.py`.

## Consequences

- New tables `mf_schemes`, `mf_nav`, `mf_metrics`, `mf_factsheet` (migration `e5b1c9a07d33`) and a new secret `MF_INGEST_TOKEN`
  (Secret Manager `fundamentals-mf-ingest-token` for the Cloud Run service + the GitHub Actions secret; both deploy scripts know it).
- Storage: ~1.8k Direct-Growth schemes x up to ~10 years of NAVs is a few million rows; check the Neon plan before a full backfill.
- Metrics are recomputed from stored NAV, so a methodology change is a recompute, not a re-download.

## Local data (issue #222)

Like the stock screener (ADR 0025), a local or self-hosted install fills its own funds data and never reads the hosted service's: run your own Postgres and data service with a throwaway
`MF_INGEST_TOKEN` and run the same job. `refresh_funds.py seed` is the one-command, resumable way: `schemes`, `ter`, NAV backfill in slices of 100 until none are left (`--category`
to do Equity first, `--max-minutes` to stop cleanly), then `metrics`. The backfill queue takes a `category` and an `after` cursor, so a scheme whose fetch fails is skipped for that run and
retried the next, rather than blocking the head of the queue. Measured while building it: ~72 bytes and ~2,900 rows per fund in `mf_nav`, so about 365 MB for ~1,800 funds.
