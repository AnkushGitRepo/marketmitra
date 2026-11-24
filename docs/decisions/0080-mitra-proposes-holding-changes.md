# 0080 — Mitra proposes holding changes; the user confirms on a card

Status: accepted (2026-11-24, issue #337; the maintainer chose "always a card, you click Confirm").

## Context

Asked to log an IPO allotment, Mitra said it could not change the portfolio. ADR 0022 made the chat's tool set read-only on purpose, and ADR 0030
opened one narrow exception (alerts) with a rule: write access to a new category needs its own ADR.

## Decision

- **One new tool, `propose_holding_change`** (`lib/ai/holdingProposalTool.ts`, schema and helpers in `lib/mitra-chat/holdingProposal.ts`): `add`,
  `update` (the new totals, not the change) or `remove`, for one NSE symbol. **The tool writes nothing.** It checks the proposal against the user's
  holdings (adding one already held, or changing one not held, is rejected with a reason the model can act on) and returns what is awaiting confirmation.
- **The card saves, not the model.** `HoldingProposalCard` shows the stock and the numbers, lets the user edit shares and average price, and on
  Confirm calls the same `/api/holdings` routes as the Portfolio page, so validation, per-user scoping, guardrail alerts, the Analyst Desk spawn and the
  retrieval resync are unchanged. Remove shows "Confirm remove". Cancel changes nothing.
- **The decision is an ordinary user message** ("Confirmed: added JPL as 40 shares at an average of ₹375." or "Cancelled: ..."), as for `ask_user`
  (0076), so the model learns what happened and the server-authoritative history is untouched. The prompt says never to claim a change before that message.
- **The turn ends at the card**: `stopAfterTool` now takes a list (`ask_user`, `propose_holding_change`). A reply with the card is stored (`hasReplyContent`).
  Card state is derived: only the newest message, while idle, can be decided; older cards are read-only records.
- **Missing numbers:** the prompt tells Mitra to resolve the symbol with `search_symbols`, use the IPO issue price from the IPO tool for an allotment, and
  ask for the quantity with `ask_user` instead of guessing.
- **Where it is offered:** the Mitra workspace only (not the older `/api/ai/chat` widget, which has no card) and not in advisor-only mode. It is withheld
  while the conversation has attachments, like the alert write tools, so a document cannot steer a proposal.
- Not logged to `/mitra-activity`: that page lists changes Mitra makes itself, and here the user makes the change with a click.

## Consequences

- The "no tool for holdings" boundary in `chatTools.ts` becomes "no tool that saves holdings"; the model can only put a card in front of the user.
- A wrong quantity from the model costs the user a click on Cancel, not a bad portfolio. The numbers stay editable on the card.
- Selling part of a position is an `update` with the new totals; there is no sell-order or realised-P&L record, as elsewhere in the app.
