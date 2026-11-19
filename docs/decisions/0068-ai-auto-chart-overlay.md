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

## Addendum (2026-11-19, #238): the setup is planned in code

The first version took the model's entry, stop and target, and they clustered at the current price. The setup is now planned by
`src/lib/chart/setupPlanner.ts` from the validated levels plus swing points, ATR(14) and the EMA 20 / 50 trend; the model supplies only
levels and a lean (`bias`), and its prices are ignored. An investor's plan: enter at the nearest support (long) or resistance (short), as a
limit order if price is not already within 0.75 ATR of it (`pullback` / `retest`), else at the current price (`now`); stop half an ATR
beyond the level; target at the nearest opposing level that pays at least 1.5 : 1; direction from the trend, else the model's lean, else
the better reward. When nothing qualifies there is no setup and `setupNote` says why. Entry and stop distances are capped per timeframe.
Still unrestricted-only, still no position sizes or return claims.
Overlay: STOP / ENTRY / TARGET badges sit on their own boundaries, a level within 0.15% of the target or stop is merged into its badge,
the trendline is styled and labelled, Bollinger Bands are hidden while Auto-Chart is on (and restored after), and the button shows an
unmistakable on state.

Badges (#240): all badges sit in the free space at the right edge beside their lines and are spread apart when they would overlap
(`tagLayout.ts`); while Auto-Chart is on the chart keeps about 240 px of empty space after the latest candle (sized in pixels, so it holds at
any zoom), and the setup box starts after the last candle, so nothing covers the price action.
