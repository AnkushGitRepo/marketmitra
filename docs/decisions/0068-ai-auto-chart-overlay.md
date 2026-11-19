# 0068 — AI Auto-Chart: model-drawn chart levels, trade setup only in unrestricted mode

Status: accepted (2026-11-19, issue #228; decided by the maintainer)

## Context

Reading structure on the stock chart (support, resistance, trend, where a setup would sit) is left to the user, and the only AI help is text.
The maintainer wants the model to draw on the chart instead of writing paragraphs.

## Decision

- An **AI Auto-Chart** toggle in the chart toolbar. On: `POST /api/insights/chart-overlay` sends the last year of daily bars (150 recent rows) to
  the caller's own model (BYOK) and gets JSON coordinates back; the chart paints them in a read-only SVG layer (`AiOverlay`). Off: all of it,
  and the indicators it switched on, are removed.
- **The model proposes, `src/lib/chart/aiOverlay.ts` disposes.** Levels must sit on the correct side of the last close, inside the traded
  range, ≤2 per side and not within 0.5% of each other; trendline dates snap to real bars; indicator names map onto the chart's set.
  Labels (`S1`, `R1`), risk/reward and percentages are produced in code, never taken from the model.
- **Guarded by default** (hosted, and local with unrestricted off): structure only. The mode is resolved on the server
  (`resolvePromptMode`, ADR 0054), never read from the request, and `parseOverlay` drops any `setup` in guarded mode even if the model emitted one.
- **Unrestricted (local only, ADR 0054):** the overlay may also carry one trade setup (entry within 5% of the last close, stop ≤25% away,
  correctly ordered for long or short) drawn as target and stop zones, an entry line and a `1 : X.X R:R` badge, with the standard
  "AI opinion, not licensed investment advice" note. Labels are neutral (`ENTRY`, `STOP`, `TARGET`); no `BUY` / `SELL` wording, no position
  sizes, no return promises.
- **Gate is unrestricted only**, not Advisor mode (ADR 0035 keeps its own stricter "no buy this" rules; this does not touch them).
- Cached 12 hours per user, symbol, mode and latest bar (`insights` scope `chart_overlay`).

## Consequences

- The hosted site cannot obtain a trade setup, even by editing a request or a stored document.
- Local unrestricted users get model-drawn levels that can be wrong; the note limits, but does not remove, that.
- Not built here: a Drawing Tools menu, a manual Long/Short position tool, and intraday bars.
