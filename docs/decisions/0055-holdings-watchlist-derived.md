# 0055 — The Holdings watchlist is derived, not stored

Status: accepted (2026-11-11, issue #106)

## Context

The maintainer wants a watchlist called "Holdings" containing every stock the user holds. Holdings already live in their own collection
(`holdings`), and watchlists in `userWishlists` (stored under the legacy `wishlists` name, ADR 0028).

## Decision

- "Holdings" is **never stored as a watchlist**. The Markets page builds it from the portfolio on each render (`withHoldingsList`) and
  shows it first, marked managed: it cannot be renamed, deleted, or edited symbol by symbol; it follows the Portfolio page.
  A stored copy would have to be synced on every buy, edit and delete and would drift.
- The name is **reserved**: creating or renaming a list to "Holdings" (any casing) is refused with 422 by `/api/watchlists` and its
  `/api/wishlists` alias, and by the name dialog, so a user list can never shadow it.
- The API is unchanged for clients: `GET /api/watchlists` still returns only the stored lists. The stock page's "+ Watchlist" menu
  lists those, with create (in a modal, adding the stock to the new list) and rename.
- Sorting a list by day change (top gainers / top losers, missing quotes last, ties stable) is a pure view concern, done client-side
  from the quotes the page already loads.

## Consequences

- Holdings appear in the Markets watchlist section only, not in the stock page menu (you cannot add to it by hand anyway).
- Existing users who already have a list named "Holdings" keep it; they cannot create another, and can rename it.
