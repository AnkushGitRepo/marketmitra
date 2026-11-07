# 0035 — Mitra Advisor: a local-only, rules-first decision-support tool

**Status:** accepted (Phase 1 built)

## Decision
Add an opt-in `Advisor` section for the owner's own long-term investing. Deterministic code decides
allocation, sizing and the quantitative screen; an LLM (later phases) only explains and reads text, and
may state only figures passed to it and must cite its source. Recommend-only: no broker, no orders.
"No action" is a first-class output.

## Gating
`isAdvisorEnabled()` = `ADVISOR_MODE === 'enabled'` **and** `!isHosted()`. Explicit flag, not hostname
detection; a server-only variable. When off: every `/api/advisor/*` route returns 404, the dashboard
pages 404, the sidebar entry is not rendered, and no advisor cron is registered. First use requires
accepting a versioned disclaimer (`advisor_acknowledgements`).

## Phase 1 scope
Policy (Zod-validated, one Mongo doc per user, JSON import/export — no YAML dependency added) and the
index-core allocator. The satellite share is parked in cash until Phase 2 supplies screened names.
Rebalancing is tax-aware by default (new money to under-weight sleeves, no selling).

## Known data gaps (for Phase 2)
fundamentals-api has no promoter-pledge data, no ratio history, no capex line (FCF is approximable
only as CFO+CFI) and no historical P/E. Screen gates return pass/fail/unknown; unknown blocks eligibility.

## Consequences
Collections: `advisor_policies`, `advisor_acknowledgements` (more in later phases). Not a product feature;
not documented as part of the public API surface beyond OpenAPI entries tagged Advisor.

## Phase 2 — quality screen (built)
`src/lib/advisor/screen/`: `config.ts` (every threshold), `rules.ts` (pure gates), `normalize.ts` (API rows →
`ScreenData`), `fetch.ts` (live read). Findings that revised the "data gaps" above: the service *does* provide a
`Free Cash Flow` line, ~10 years of annual P&L/balance sheet, and 13 quarters of shareholding; ROCE history is
derived as (PBT + interest) ÷ (equity + reserves + borrowings) and cross-checked against the reported ROCE
(disagreement is a warning flag, not a block); historical P/E = year-end price ÷ EPS over the 5y price window
(so a 10-year median is not possible yet). Still missing: **promoter pledge** — always `unknown`, which blocks
eligibility by design — and banks/NBFCs lack PBT/interest lines, so their ROCE and growth gates are `unknown`.
