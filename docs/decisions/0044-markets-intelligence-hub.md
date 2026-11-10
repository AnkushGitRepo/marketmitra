# 0044 — Markets page: market intelligence hub

Status: accepted (2026-11-11, issue #71)

## Context

`/markets` was a watchlist editor with four index cards. It had three competing search fields, e-commerce wording ("wishlist"),
no breadth or sector view, and one-click destructive actions.

## Decision

- **One search**: the standalone banner is gone; the header search (⌘K) does global lookups and the watchlist panel keeps only
  its targeted "Add symbol" input.
- **"Watchlist" everywhere users read it** (UI, API error messages, settings text, Mitra's prompts, the OpenAPI descriptions
  and tag). The documented paths (`/api/wishlists…`), the Mongo collection and export field keep the legacy `wishlists` name:
  renaming them would break API consumers and stored data for no user benefit.
- **Safety**: deleting a watchlist needs a modal confirmation (native `<dialog>`: focus trap, Esc cancels); removing a stock is
  behind a ⋯ row menu, hover-revealed with a fine pointer and always visible on touch. Delete is separated from Rename and in the
  warning colour.
- **Layout**: indices row (carousel on phones) and a breadth bar on top; below, watchlists (65%) beside Sector performance
  and Mitra Market Pulse (35%). On phones the order is indices, watchlists, sectors, pulse, breadth.
- **Sector performance** = the 12 NSE sectoral indices via Yahoo (`SECTOR_INDICES`; each verified to return a live quote).
- **Breadth** = advances / declines / unchanged across the NIFTY 50 constituents (one batched Yahoo request), labelled "NIFTY 50
  breadth, n of 50 reporting"; withheld when fewer than 25 priced. The constituent list is hand-maintained and can lag a
  rebalance. This is **not** whole-exchange breadth: no free permitted all-NSE source exists.
- **Mitra Market Pulse**: two sentences grounded only in the page's own figures (`MARKET_SYSTEM`, guardrail appended), per-user
  cache 1h, opt-in "Generate" (so loading the page never spends the user's key). `POST /api/insights/market`.
- New public `GET /api/markets/overview` (breadth + sectors, cached ~60s per instance), documented in `public/openapi.json`.

## Not built, on purpose

- **FII/DII flows**: NSE blocks our servers and we do not bypass bot checks, and no free licensed alternative exists. Omitted
  rather than shown as a fake or permanently empty card. Revisit if a permitted source appears (or manual daily entry is wanted).
- **1D sparklines**: there is no intraday series; rows show a 1-month trend line and say so.
- Tailwind (ADR 0003): CSS Modules and tokens.

## Consequences

`WishlistPanel` and `MarketsSearchBar` are removed. `AiBriefCard` and `IndexStrip` gained props so the dashboard and Markets
share them. Sector/breadth data is only as available as Yahoo; every card has an explicit unavailable state.
