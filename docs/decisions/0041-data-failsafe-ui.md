# 0041 — Fail-safe UI for data-dependent views

**Status:** accepted, built (#64)

## Context
On an iPhone the stock page chart rendered as an empty box with its OHLC legend printed over the range buttons (issue
#64). Two separate weaknesses: a layout that collapses in iOS Safari, and no recovery whatever when price history (or the
whole data service) fails: one server-side attempt, then a dead-end sentence until a manual reload.

## Decision
**Never depend on the diagnosis; verify the outcome.**
- **Layout:** `.stage` uses `flex: 0 0 auto` + explicit height + `min-height` in the mobile column layout. The old
  `flex: 1` (basis 0%) plus `height` is resolved differently by iOS Safari (most likely cause; not reproduced here, no
  WebKit available), so the new rule doesn't rely on that resolution.
- **Chart fail-safe** (`src/components/pro-chart/`): the interactive chart reports a failure if the browser has no 2D
  canvas, `createChart` or series building throws, the container measures as collapsed (< 200 px) after layout settles,
  or **nothing visible was painted** after ~2.2 s (`hasVisibleInk` over the canvases). Any of these swaps in `ChartFallback`,
  a plain SVG close-price line from the same bars with Low/Last/High, a notice and "Try interactive chart". The fallback
  is in normal flow with its own height, so it cannot vanish with the failure that triggered it. A `ChartErrorBoundary`
  catches render exceptions.
- **Data recovery:** if the server render had no bars, `useChartBars` fetches them from the new public
  `GET /api/stock/{ticker}/prices?period=` (502 `price_history_unavailable` = retryable) with a 12 s timeout and 4 attempts
  (1 s / 3 s / 7 s back-off, client errors not retried), showing a skeleton, then an error with **Retry**.
- **Server-rendered dead ends:** `DataUnavailable` (stock page, Markets index grid) re-checks automatically twice
  (4 s, 10 s) via `router.refresh()` and always offers "Try again".
- Reusable primitives: `src/lib/net/retry.ts` (`retryWithBackoff`, `fetchJsonWithTimeout`, `isRetryableError`),
  `src/lib/chart/fallback.ts`.

## Verified (Chromium; no WebKit)
Normal chart at 390 px; forced no-canvas → fallback (found and fixed a gap: the async paint failure wasn't caught until the
ink check was added); flaky source (2 failures then success) recovers without input; permanently failing source ends in
the error panel and Retry restores the chart; a dead data service shows the unavailable box with two automatic re-checks
and a working button.

## Not verified / not done
Real iOS Safari (the actual bug report): please check on the phone. Price history only has daily bars, so the fallback
is a daily line. Other pages still have text-only "unavailable" states and should adopt `DataUnavailable` over time.
