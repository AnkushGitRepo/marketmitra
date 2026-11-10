# 0043 — Portfolio page: hero KPIs, allocation donut, computed risk cards

Status: accepted (2026-11-11, issue #69)

## Context

The Portfolio page hid its key numbers, listed allocation as bars, showed Mitra's insight as a dense paragraph, repeated
per-holding P&L as a bar chart, and could show activity unrelated to holdings.

## Decision

- **Hero** (`PortfolioHero`): value, invested, Total return and Today pills (shared `ReturnBadge`, also used by the dashboard),
  chart with 1M/6M/1Y/5Y below. Maths in `src/lib/portfolio/portfolioMetrics.ts` (pure, unit tested).
- **Allocation** (`AllocationCard`): a static SVG donut (no chart library, nothing to fail to load) with a legend; sectors past
  the sixth fold into "Other". Concentration pills: top 3 share and largest position.
- **Mitra risk copilot** (`RiskCopilotCard`): three cards (concentration, sector skew, return drivers) **computed from the
  holdings**, so they work without an AI key and are never invented. Thresholds: top 3 >= 50% high, >= 35% moderate; one
  sector >= 40% high, >= 30% moderate. A button links to Mitra chat.
- **Holdings** (`HoldingsSection`): All / In Profit / In Loss chips with live counts (strictly positive / negative P&L; flat or
  unpriced rows only under All); P&L as red/green pills. The duplicate "Unrealized gain/loss by holding" chart is removed.
- **News** is requested for the held symbols and then filtered again client-side (`newsForHoldings`); the recent-activity
  card (watchlist alerts) is removed from this page. Alerts live on the dashboard.

## Deviations from the request

- CSS Modules and tokens instead of Tailwind classes (ADR 0003).
- The AI-written portfolio paragraph is no longer on this page; the risk cards replace it. The dashboard's AI Daily Brief still
  generates and shows the cached portfolio insight. The `/api/insights/portfolio` endpoint is unchanged.
- The "sector skew" count is computed ("6 distinct tickers" for the maintainer's data), not copied from the example text.

## Consequences

`InsightCard` and `ActivityCard` are no longer used on the Portfolio page.
