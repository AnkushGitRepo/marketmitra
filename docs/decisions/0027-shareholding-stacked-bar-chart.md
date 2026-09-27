# 0027: Shareholding pattern chart — 100% stacked bar over multi-line

Date: 2026-09-27
Status: accepted, built, verified locally.

## Context

The stock detail page's shareholding pattern card plotted one line per
holder category (Promoters/FIIs/DIIs/Public/Government) over time — five
overlapping polylines sharing one 0-N% axis. Reading any single period's
composition meant tracing five lines to the same x position and comparing
their y values by eye; the shape most people actually want ("who owns how
much of this company, right now, and how has that mix shifted") wasn't
legible from that layout.

## Decision

Replace the multi-line chart with a **100% stacked bar chart**: one bar
per period, each bar's full height representing 100% of shares, divided
into colored segments sized by each category's actual weightage that
period. This is a categorical-composition-over-time shape, and a stacked
bar reads that shape directly — segment height *is* the share, and the
whole bar is always a complete picture of that period's ownership — where
a line chart forced the reader to reconstruct composition from five
separate trend lines.

- Segment colors are the same brand-derived palette `groupShareholding()`
  already assigned per category (`transforms.ts`'s `CATEGORY_COLORS`) —
  no new colors introduced.
- Hover shows an exact-value tooltip (`"Promoters — 46.2% — Mar '26"`);
  the legend below stays name+swatch only, matching this repo's existing
  chart convention (`LineChart.tsx`'s hover-tooltip-carries-precision,
  legend-carries-identity split) rather than doubling as a value display.
- Bars grow in on load (`scaleY` from 0, staggered per bar via a
  `--bar-i` custom property) and segments respond to hover — the same
  "subtle draw-in + responsive hover" motion contract every other chart
  on this page (`LineChart`) already honors, gated behind
  `prefers-reduced-motion` like the rest of the app.
- Built as a new standalone component (`ShareholdingBarChart.tsx` +
  its own CSS module) rather than inline in `StockPageClient.tsx`, mirroring
  how `LineChart.tsx` owns its own chart+tooltip — keeps the page component
  from re-accumulating chart math it doesn't otherwise need.

## Consequences

- No data or API shape changed — `groupShareholding()`'s output
  (`ShareholdingSeries[]`, one entry per category with a chronological
  `points` array) already had everything a stacked-bar layout needs; only
  the rendering changed.
- Category order in the stack follows whatever order `groupShareholding()`
  returns (source-data insertion order) — not alphabetized or
  magnitude-sorted. Revisit if a specific stacking order (e.g. promoters
  always at the bottom) turns out to matter for readability.
- Bar heights use each category's raw reported percentage per period
  (no re-normalization to force an exact 100% sum) — real filings are
  consistently close enough to 100% that this doesn't leave a visible
  gap in practice; if a company's data is ever meaningfully off from
  100%, the top of its stack simply won't touch the chart's ceiling,
  which is honest rather than papering over a real data gap.
