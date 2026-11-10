# 0042 — Dashboard: unified hero card and 70/30 layout

Status: accepted (2026-11-10, issue #67)

## Context

The dashboard spread one story over several places: three stat cards, a chart card that repeated the portfolio value, a
separate indices block, and triggered alerts buried at the bottom. The maintainer asked for a unified hero, a balanced
indices row, a 70/30 desktop layout and clearer gain/loss contrast.

## Decision

- **Hero card** (`HeroPortfolioCard`): value at 32px bold, "Today" and "Total return" pills, range tabs in the same header row,
  chart below. Percentages and signs come from pure functions (`heroMetrics.ts`); today's % is measured against yesterday's value.
- **Indices** (`IndexStrip`): NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX via `orderIndices`; 4 columns on desktop, 2 on tablet,
  a CSS scroll-snap carousel on phones.
- **Layout**: CSS grid 7fr/3fr from 1100px. Below that the column wrappers use `display: contents` so `order` interleaves
  hero, alerts, movers, brief and IPOs in priority order on phones.
- **Critical alerts** are triggered `alert` notifications from the last 7 days (`criticalAlerts.ts`); stop-loss/drawdown and
  falls are red, the rest amber. Severity is shown by border, a word pill and the tag, never colour alone.
- **AI Daily Brief** reuses the cached portfolio insight (two sentences, `briefText.ts`); generating is opt-in, so opening the
  dashboard never spends the user's AI key.
- **Losers** use a muted red pill (`--app-loss-bg/-text`, from the email system's accessible tones) with a ▼ next to ▲ for gainers.
- **IPOs** collapse to a one-line banner when none are open.

## Deviations from the request (and why)

- Plain CSS Modules with tokens, not Tailwind classes (ADR 0003); no dark theme exists yet, so no `dark:` variant.
- Ranges are 1W/1M/1Y/5Y: the history provider has no intraday series, so **1D is not offered** rather than faked; 1W is the
  last 6 points of the 1M series. The previous 6M tab was dropped to match the requested set.

## Consequences

The old `statsGrid`, `chartCard` and `ActivityCard` use on the dashboard are gone (`ActivityCard` stays for other pages if any).
