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

## Phase 3 — cited research memo (built)
`src/lib/advisor/memo/`. One structured-JSON LLM call (not the Phase 11 agent loop — that pipeline's debate/trade
framing doesn't fit a recommend-only memo; only its `scanForTradeActions` tone check is reused). Inputs are the
screen's measured values (citable facts `F1…`) and keyword-ranked passages of the latest annual report
(`AR1-nnn`, ≈60k chars). `cite.ts` is the gate: every claim needs a citation whose quote is a verbatim excerpt of a
supplied source, or `notFound: true` with no figures; every number must appear in a cited quote; no trade-call
language; thesis ≤ 3 sentences; kill criteria restricted to seven machine-checkable metrics with sane ranges.
One repair attempt with the validator's complaints fed back; otherwise the memo is rejected and nothing is stored.
Code adds three standing kill criteria (`killDefaults.ts`) independent of the model. The prompt is
`memo/prompts/v1.ts` (`memo-v1`, stored with every memo, along with the exact source text for audit).
Needs `IPO_INGEST_TOKEN` in `.env.local` (same secret as the fundamentals service) to read filings.
