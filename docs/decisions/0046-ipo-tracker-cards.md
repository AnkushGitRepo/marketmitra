# 0046 — IPO tracker: dense cards, prominent GMP, one filter bar

Status: accepted (2026-11-11, issue #79)

## Context

Each IPO was a sparse full-width row (name, two grey badges, a raw GMP string, two dates) with issue price, lot size, issue size
and subscription hidden behind a click; two near-identical rows of filter pills (with "0" tabs) competed for attention; and the
grey-market premium, the main retail anchor, had no visual weight.

## Decision

- **One filter bar** (`IpoFilterBar`): lifecycle tabs on the left (**Live & Upcoming**, **Closed**, **Recently listed**; empty
  tabs hidden unless active), the type control (All / Mainboard / SME, with counts) on the right. The page opens on the first
  tab that has IPOs. "Notify me" moved to the header's right. The URL keeps the view; old `?status=` links map onto the tabs.
- **Cards** (`IpoCard`), no click needed: name, type badge, status pill, issue price, lot size with minimum investment (lot x
  price), issue size, overall subscription (green from 1x, amber under), and a bidding / allotment / listing timeline with
  finished steps ticked. Detail (GMP range, anchor, rating, AI brief, per-IPO alerts) stays behind "Details & alerts".
- **GMP pill** (`gmpView`): green for a positive premium, solid and stronger from 20%, red when negative, "GMP: awaiting data"
  when there is no figure (never zero). Hidden once an issue has listed, since it is a pre-listing signal.
- **Status pill from the dates** (`ipoBadge`): Open today (green), Closes today / tomorrow / in 2 days (amber), Opens in N days
  (blue), Closed, Allotment done, Listed.
- **The dates win over a lagging source** (`ipoPhase`): an open or upcoming issue past its close date is closed; an upcoming one
  inside its bidding window is open. Tabs, counts and pills therefore always agree.
- Zero is the source's placeholder for a price/size/lot not announced yet, so `known()` treats zero and negatives as missing.
- Phones: stacked cards, GMP and status in the header, a 2x2 grid for price / lot / size / subscription, the timeline beneath,
  bottom safe-area padding.

## Deviations from the request

- **"Issue price", not a price band**: the data has one price per IPO and no lower bound; no range is invented.
- **Overall subscription only**: no retail / QIB / NII split in the data.
- **No logo, sector tag, or listing gain / LTP** for listed issues: not in the data.
- **Three tabs, not two**: closed-but-unlisted issues need a home.
- CSS Modules, not Tailwind (ADR 0003).

## Consequences

`IpoRow` is removed; `ipoFilters.ts` is now group-based (the phase filters and their tests are replaced). Adding retail
subscription, a price band or listing prices means extending the scraper and the `/ipos` schema first.
