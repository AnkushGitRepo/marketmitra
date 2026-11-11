# 0048 — Mitra chat: portfolio-aware empty state, upload affordances, mobile fit

Status: accepted (2026-11-11, issue #83)

## Context

On phones the chat card's bottom edge ran into the raised Mitra orb of the tab bar, a forced `min-height` could push the composer
behind the tab bar, and on a short screen only one starter prompt was reachable. The app header ignored the safe-area top inset.
The empty state asked "What are you working through?" and offered generic prompts although Mitra knows the user's holdings; the
paperclip was small and files could only be dropped on the composer.

## Decision

- **Mobile fit** (CSS, no `position: fixed`): the card height is `100dvh - header(95px) - safe-area top - tab bar - safe-area
  bottom - 28px`, and the card ends 28px above the tab bar because the orb sticks up 22px; no forced min-height beyond 320px.
  History moved into the chat's own header bar (one row saved). The scroll area is a flex column so the empty state centres when
  there is room and starts at the top, never clipped, when there is not. `AppHeader` now pads for `safe-area-inset-top`.
  Fixed positioning was rejected: the card is a flex layout that already keeps the composer inside it, so the bug was sizing and
  clearance, not stacking.
- **Greeting** (`EmptyState`): "Good morning/afternoon/evening[, first name]" by IST hour, the heading "Mitra Financial Copilot", and
  a live status ("Your portfolio is at ₹52,072 (+₹773 today)…") that respects the hide-values mask. The context comes from a new
  authenticated `GET /api/mitra/context` (first name on hosted accounts and live-priced holdings), fetched after the page
  loads so opening a conversation is not delayed by live quotes; failures fall back to generic starters.
- **Personalised starters** (`buildStarterPrompts`, pure and tested): concentration (top-3 share and names), sector exposure
  (largest sector share), top winner (valuation after the gain) or, with no gainer, a drawdown review, and a document card that
  opens the file picker with a prefilled prompt. Fewer than three priced holdings turns concentration into a diversification
  prompt; none priced shows the generic set.
- **Uploads**: a labelled Attach button with a tooltip, a mic tooltip, a window-wide drop overlay over the whole conversation
  (paste still works; the composer no longer handles drops itself, so a drop is never added twice), and 44px touch targets and
  16px input text on phones. Send is a muted pill until there is text or a ready file, then solid ink; Stop is always solid.
- **History panel** unchanged: search, Today / Yesterday / Previous 7 days / Older grouping and the hover trash with confirm
  already existed and were verified.

## Deviations from the request

- **No "Should I cut losses on X?" prompt.** Mitra never gives buy/sell/hold advice (`GUARDRAIL`), so the drawdown card asks what
  changed in the business and the news. A test pins that no starter asks for a buy/sell/cut-losses call.
- **No `position: fixed; pb-36`**: see above. CSS Modules, not Tailwind (ADR 0003).

## Consequences

`portfolioMetrics.ts` gains `returnRanking` and `holdingReturnPct`, shared with the risk cards. The empty state needs one extra
request; it shows a skeleton until it arrives.
