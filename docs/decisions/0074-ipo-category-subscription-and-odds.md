# 0074 — Category-wise IPO subscription and allotment odds

Status: accepted (2026-11-21, issue #285; the maintainer pointed to the source page).

## Context

The IPO data had one overall subscription multiple. Investors choose between retail, small NII (sNII, above ₹2 lakh to ₹10 lakh) and big NII
(bNII, above ₹10 lakh) by each category's own demand, so neither the card nor the brief could say anything honest about allotment odds. A
search found no free, licensed API for it; the exchanges publish it behind browser cookie checks (AGENTS.md: do not bypass bot checks) and
the other aggregators paywall it or give no reuse terms.

## Decision

- **Source:** the aggregator the tracker already reads (InvestorGain). Each dashboard row links to `/gmp/<slug>/<id>/`; the same slug and id
  under `/subscription/` is the IPO's subscription page, with a server-rendered `bid-table` (one row per bidding day: QIB, NII, S-NII, B-NII,
  RII, Total). The latest row is stored. Same ToS position as the existing scrape (ADR 0017): an accepted known risk, one isolated module,
  degrade to "unknown" on any failure. Only an `investorgain.com/gmp/...` link is ever turned into a URL to fetch.
- **Fetching:** `scripts/refresh_ipos.py` renders those pages after the dashboard, only for open and closed IPOs, 2 s apart, at most 15 per
  run; a page that fails is skipped and the stored figures stay.
- **Storage:** six nullable columns on `ipos` (`sub_qib`, `sub_nii`, `sub_snii`, `sub_bnii`, `sub_retail`, `sub_as_of`), migration
  `f2a6c8d41b95` (additive; the maintainer runs it on production). A figure that is missing is null, never zero.
- **Odds** (`src/lib/dashboard/ipoAllotmentOdds.ts`, pure): retail and sNII are allotted by draw, so the chance of one allotment is about
  1 / subscription; bNII is allotted in proportion, so about 1 / subscription of the bid; a category under 1x gets everything. These are
  estimates from a multiple that counts shares bid, not applicants, and they are labelled so. The proportional bNII figure is a share of the
  bid, so it is never ranked against the draw categories.
- **Surfaces:** the IPO details show a category table (multiple, smallest application, estimated odds). The brief prompt carries the same
  numbers (computed in code, not by the model). In **unrestricted mode only** (ADR 0054, 0070) the brief adds a "Best category" item; the
  guarded brief states the demand and odds as numbers and never says which category to choose.

## Consequences

- The data service must be deployed and the migration run before the columns exist; until then the fields are absent and the UI shows nothing
  extra (the Next app treats them as optional).
- It adds up to 15 page loads to each `refresh-ipos` run (about 30 to 60 s).
- If the aggregator changes the page, the parser returns nothing and the card falls back to the overall figure; the fixture test is the
  place to see what changed.
