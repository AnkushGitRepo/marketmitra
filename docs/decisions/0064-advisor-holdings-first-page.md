# 0064 — Advisor: a zero-setup, holdings-first overview page

**Status:** accepted (#202). Amends [0035](./0035-mitra-advisor.md); the gating and recommend-only rules there are unchanged.

## Context
The Advisor opened on "No policy yet" and a 14-field form, had six sub-tabs that repeated the Screener, Analyst Desk and Notes, and ignored the holdings the app already stores.

## Decision
`/advisor` is one page that reads live holdings (`getEnrichedHoldings`) and works with **no saved policy**: a preset (Conservative, Balanced growth, Aggressive alpha, in `diagnostics/profiles.ts`) supplies the limits until the user saves their own, which then always wins. The page has: a fresh-money view, a drift audit (single-stock and sector weights against limits), a drawdown review (down 30% or more on cost), a "does it fit my rules" check for one ticker, and a decision tracker built from holdings and their analysts. The policy form moved into an "Allocation rules" drawer and gained a sector limit (`maxSectorPct`, default 30, so older saved policies still parse) and preset buttons.

- **Still local-only and recommend-only.** `ADVISOR_MODE` and `!isHosted()` gating is unchanged; a hosted instance 404s. The request to run it hosted was declined.
- **Neutral wording.** The fresh-money view is policy arithmetic: the target split of the amount, how far each over-limit position would be diluted, and the room left under sector limits. It names nothing to buy or sell; a test runs the output through `scanForTradeActions`.
- **Nothing shipped is removed.** Screen, Research memo, Journal and Performance keep their routes and APIs, linked from the page; the sub-nav now appears only on those pages, as a way back.
- All new logic is pure (`src/lib/advisor/diagnostics/`) and reads only MongoDB holdings and cached quotes, so it no longer depends on the NIFTYBEES benchmark. New read routes: `GET /api/advisor/overview`, `GET /api/advisor/fit`.

## Follow-up: less math on the page (same issue)
First review: the page read as a dense audit. It now shows five traffic-light guardrails (stock limit, sector limit, top-3 concentration, deep drawdowns, stress tolerance) with a "X of 5 healthy" count rather than an invented 0 to 100 score, and a two-column layout: drift bars and drawdown watch on the left; the fit check, the fresh-money split (three cards, limit detail collapsed) and a what-if stress test on the right. The stress test cuts every affected price by the same percentage (everything, or one sector) and compares the loss with the policy's `maxTolerableDrawdownPct` (presets: 15, 25, 35); it is an illustration, not a forecast, and uses no beta. "Criteria clear" links to the Analyst Desk rather than opening a drawer.

## Consequences
The decision tracker's "thesis" column shows whether an analyst's enabled criteria are breached, not a verdict on the stock. The monthly plan view was replaced on the page; `GET /api/advisor/plan` remains.
