# 0085 — Portfolio rules: the user's own thresholds, reported as plain numbers

Status: accepted (2026-11-27, issue #442; the maintainer asked for user-defined guardrail and milestone alerts that stay clear of investment advice).

## Context

The default guardrails (ADR 0030) watch one stock at a time with a trailing stop and a drawdown watch. They cannot say "any holding that has tripled", "any holding 25% under what I paid" or "one stock is now more than 20% of the book", and the numbers are not the user's to set in one place.

## Decisions

- **One `portfolio_rules` alert per user**, the same shape as `ipo_watch`: a single document whose params are the user's thresholds (`profitMilestonesPct`, `costDrawdownPct`, `maxPositionWeightPct`, `week52High`), idempotent through `sentKeys`. This reuses delivery, channels, the cron cycle and the audit of alerts, instead of a second rules collection and evaluator. It is created by upsert (POST returns 200), is listed in its own card on `/alerts`, and is not shown among the individual alerts.
- **A trailing drop from a holding's own peak is not duplicated.** It already exists as the per-holding `trailing_stop`, whose `peakPrice` is tracked by the engine.
- **Only the highest level crossed is announced**, but every level crossed is remembered, so a stock already past +300% is not also announced at +100% and +200%. A condition that clears drops its key and can announce again later.
- **One grouped notification per cycle**, so a rule already true on the first run is one message, not one per holding. Saving the rules resets `sentKeys` on purpose: a rule that is already true announces once.
- **Neutral wording is a rule, not a style.** Each line states the holding, the figure, and the user's own threshold; it never says buy, sell, hold, book or exit. A test asserts the default rules never produce those words.
- **The thresholds are the user's**: nothing is on until they switch it on, and the card shows suggested values only as a starting point.

## Consequences

- A new alert type must be added to `paramsSchemaForType`, `describeAlert` and `alertGroup` (the compiler enforces this).
- The cycle sends one portfolio-rules message per user per run at most.
- Peak since purchase on holdings (issue #443) is computed from daily closes after the purchase date and needs no stored high-water mark.
