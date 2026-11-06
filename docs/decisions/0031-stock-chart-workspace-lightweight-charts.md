# 0031: Stock chart workspace — lightweight-charts, indicators, drawing tools

Date: 2026-11-06
Status: accepted, built, verified locally (stock page, RELIANCE/TCS).

## Context

The stock page's price card was a 12-point SVG line chart (later with a
candlestick toggle). Users asked for a TradingView-style workspace: a right-hand
price axis, the most-used indicators, and drawing tools, laid out like the
reference screenshot (top toolbar, left tool rail, bottom range tabs).

## Decision

- **Engine: `lightweight-charts` 5.x** (TradingView, Apache-2.0) instead of
  extending the hand-rolled `CandleChart`. It gives a real price scale,
  crosshair, zoom/pan and multi-pane layout; hand-building those was far more
  code and risk. The library's attribution logo stays on (its licence requires
  a TradingView link/notice), so the "TV" mark in the chart corner is not
  removable without replacing it with an equivalent notice.
- **Indicators** (pure, unit-tested math in `src/lib/chart/indicators.ts`):
  Volume, SMA 20/50/200, EMA 20/50, Bollinger (20, 2), RSI (14), MACD
  (12, 26, 9). Computed client-side from the 5-year daily series, so long
  averages are correct from the first visible bar. Selection persists in
  `localStorage` (`mm:chart:indicators`).
- **Drawing tools** (trend line, horizontal line, Fib retracement, measure,
  text note) are an SVG overlay, not library primitives. Drawings are stored in
  data space (bar date + price) so they survive zoom/pan/resize, and persist
  per symbol in `localStorage` (`mm:chart:drawings:{SYMBOL}`). v1 limits:
  no select/drag/edit of an existing drawing — only "remove all".
- **Data:** one 5-year daily fetch backs every range tab (1M/3M/6M/YTD/1Y/5Y/
  All) by windowing the time scale. 1D/5D from the reference need intraday
  bars, which no data source here provides — intentionally omitted.
- Candle colours stay the landing-page tokens (`--color-mint-strong` up,
  `--color-danger-soft` down).
- The component is client-only (`next/dynamic`, `ssr: false`).
- Index detail pages keep the lighter `PriceChart` (line/candles) for now.

## Consequences

- New runtime dependency (`lightweight-charts`, one transitive: `fancy-canvas`).
- Drawings and indicator choices live in the browser only — not synced across
  devices or exposed to the API/Mitra.
- Follow-ups: select/move/delete individual drawings, undo, adopting the
  workspace on index pages.
