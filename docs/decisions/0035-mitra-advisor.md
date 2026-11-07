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
