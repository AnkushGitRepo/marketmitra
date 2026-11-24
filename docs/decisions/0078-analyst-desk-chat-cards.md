# 0078 — Analyst Desk chat cards

Status: accepted (2026-11-24, issue #329; the maintainer asked for the Agents page chats to answer in rich UI where possible, with text as the fallback).

## Context

ADR 0077 let Mitra chat answer with an A2UI card built on the server. The Agents page has its own chat (one analyst per stock, and the Root Agent) that
reuses the same message renderer but answered only in text, from a fixed context with no tools.

## Decision

- **Same path, two new card tools** (`lib/ai/a2uiTools.ts`): `show_analyst_card` in a stock analyst's chat (status, dossier summary, up to three strengths and
  three open risks, the latest three journal notes) and `show_desk_overview` in the Root Agent's chat (every analyst's status and latest note, eight rows
  at most). The builders (`lib/mitra-chat/a2ui/analystCards.ts`) read the stored dossier and journal; the model only chooses to call the tool.
- **Untrusted text stays text.** Dossier and journal text is model output shaped by external headlines, so it is clipped and only ever placed in plain-text
  components, never markup. A missing dossier says "No dossier yet" instead of inventing one; unreadable dates show `n/a`.
- **Opt-in and narrow.** The same `chat.richReplies` setting (off by default) turns it on. When off, the route offers no tools and the prompt does not mention
  them. When on, the chat gets exactly one read-only tool and at most two steps (the card, then a short written answer); the prompt repeats that it must
  never say what to buy, sell, trim or add. The chat is still not saved.
- **The model never reads the layout, in either chat.** Cards from earlier turns come back as history; `convertToModelMessages` applies a tool's
  `toModelOutput` (the text summary) only when it is given the tools. The Analyst route now passes them, and so does the Mitra workspace route, which had
  not (a card from the last two turns would have reached the model as full layout JSON, ADR 0077). A test pins both sides.
- A shared `a2ui/kit.ts` holds the small builder helpers; `CARD_TOOLS` lists every tool whose output the chat draws as a card.

## Consequences

- Three card tools now share one pattern; a new card means a new pure builder, a loader, and an entry in `CARD_TOOLS`.
- Cards are only as fresh as what is stored; they say nothing about live prices.
- Hosted behaviour is unverified while Vercel is paused (`docs/POST-PAUSE-CHECKS.md` 4f).
