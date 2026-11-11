# 0045 — Screener: compact live filters, sticky table, mobile cards

Status: accepted (2026-11-11, issue #77)

## Context

The open filter form (nine Min/Max pairs) filled the first screens, results needed an "Apply filters" click, and on phones the
table clipped sector names and pushed ROE, D/E and P/E off-screen, the very metrics being screened.

## Decision

- **Compact toolbar** (`ScreenerToolbar`): preset chips in one scrolling row, search, sector, and a "More filters (n)" accordion
  holding industry and the Min/Max grid. Applied filters are pills with inline ✕ and "Clear all".
- **Live results**: no Apply button. Text and number inputs re-run the screen after a 300 ms pause; selects, presets, pills and
  sorting apply at once. The debounced callback reads the currently applied filters from a ref, an unchanged query is skipped,
  and only the newest request may update the screen. A draft that is invalid (non-number, min above max) is reported after the
  pause and does not query. The match count is an `aria-live` region.
- **Table** (`ResultsTable`): a bounded scroll box so the header and the company column stay put (a sticky header needs a
  scroll container that actually scrolls vertically); numbers right-aligned; ↕ / ↑ / ↓ sort arrows on real buttons; columns used by
  a filter or the sort move next to the company and are tinted (`orderColumns`, `highlightedKeys`).
- **Phones (< 768px)**: no inline inputs. A docked bar above the tab bar has "Filters (n active)" and a Sort-by select. Filters
  open a full-height native `<dialog>` bottom sheet with the same controls, applying live behind it, with a "Show N companies"
  button. Results are cards (name, symbol, sector badge that wraps instead of clipping, price, four metric chips: the screened
  metrics first, then MCAP / P/E / ROE / D/E: `cardMetricKeys`). Table and cards are both rendered and swapped by CSS, so there
  is no hydration branch on viewport.
- **Utility**: Download CSV stays beside the count above the table; the two explanatory paragraphs sit behind an (i) button beside
  the title.
- Pure logic in `src/lib/screener/view.ts` and `columns.ts` (tested). URL-synced state, presets, pagination, the CSV export and
  Mitra's open-screen links are unchanged.

## Deviations from the request

- **No day-change % on the cards**: the screener table is refreshed daily and has no day-change field; fetching live quotes
  per row is out of scope. Cards show the price.
- CSS Modules, not Tailwind (ADR 0003). Presets are the existing seven, not new ones.

## Consequences

`ScreenerFilterPanel` is removed. About 15 filter/results classes were dropped from the page stylesheet. The desktop table scrolls
inside a 72vh box rather than the page.
