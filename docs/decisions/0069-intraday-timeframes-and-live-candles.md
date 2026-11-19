# 0069 — Intraday timeframes and live candles on the stock chart

Status: accepted (2026-11-19, issue #236; scope chosen by the maintainer)

## Context

The stock chart had daily candles only, and the price and today's candle updated slowly. The maintainer wants 1m, 5m, 15m and 1h
candles that move, a live header price, and every chart feature (indicators, drawings, AI Auto-Chart) working on each timeframe.
There is no free streaming feed for Indian stocks, and no paid tier is allowed (ADR 0011, 0016).

## Decision

- **Source:** yahoo-finance2 `chart()` inside the Next app (the app already uses it for quotes, ADR 0024). Nothing changes in the Python
  service. Yahoo's limits shape the windows: 1m about 5 days (its cap is 7), 5m 30 days, 15m 55 days, 1h about a year. Yahoo data is delayed
  and unofficial, as everywhere else in `docs/data-sources.md`.
- **Routes:** `GET /api/stock/{ticker}/candles?interval=1m|5m|15m|1h|1d[&last=N]` and `GET /api/stock/{ticker}/live` (header price). Both
  are public read-only market data, rate limited by `src/proxy.ts` like every `/api` route. Day keeps its history from the fundamentals
  service; the Day tail and today's candle come from the same candles route.
- **Live updates are polling, not streaming**, and only while the market is open (weekdays 09:15 to 15:30 IST; exchange holidays are not
  known, so a holiday reads open and nothing moves) and the tab is visible. Cadence by timeframe, decided server-side and returned as
  `pollMs`: hosted 1m 10 s, 5m 30 s, 15m 60 s, 1h 120 s, Day 30 s; a local install polls twice as fast with a 5 s floor (one user, no
  shared quota). The server answers polls from a per-process TTL cache with an in-flight guard (hosted: half the poll interval; local 2 s),
  so many viewers of one symbol cost one Yahoo call per window. A poll asks only for the newest 3 bars.
- **Bar times:** a daily bar keeps its `YYYY-MM-DD`. An intraday bar's `time` is the epoch seconds of its start shifted +5:30 (so
  lightweight-charts, which draws UTC, shows IST), as a decimal string. Code that only compares or looks up `time` is unchanged; code that
  reads it as a date goes through `src/lib/chart/timeframes.ts`. Yahoo stamps the forming last bar with the last trade time, so it is
  snapped to its bar start (hourly bars start at :15) and the next poll replaces it.
- **In-place updates:** the chart updates only the newest points of each series (`series.update`) when a poll adds or refreshes the last
  bars, so indicators, panes, drawings and the user's pane sizes are untouched; any other change (timeframe, indicators, settings) rebuilds.
- **Drawings are per timeframe** (Day keeps its old storage key). Changing timeframe turns Auto-Chart off.
- **AI Auto-Chart on every timeframe:** the request carries `interval`; the bars, prompt (IST times), freshness window (2 min on 1m to 12 h
  on Day) and cache key follow it. Distance limits scale with the timeframe (a setup's entry within 0.5% of the last close and a stop within 2%
  on 1m, up to 5% and 25% on Day), and levels are merged at a tenth of the entry distance. Guarded versus unrestricted is unchanged
  (ADR 0068): the server resolves the mode and drops any setup in guarded mode.

## Consequences

- More Yahoo traffic. It is bounded by the caches and by pausing when the tab is hidden or the market is closed; if Yahoo throttles, the
  routes answer 502 and the chart keeps its last bars.
- The first load of 1m and 5m is a few thousand rows; hosted caches it for 60 s per symbol.
- Intraday history is short (1m about 5 days), so long-period indicators (SMA 200) have little to show on 1m.
- Not built: a streaming feed, pre-open or after-hours candles, exchange-holiday awareness, and a custom date range for intraday.
