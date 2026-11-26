# 0083 — Mitra remembers what the user tells it

Status: accepted (2026-11-26, issue #402; the maintainer asked for a Mitra that improves with use, and chose auto-save with a place to review, over confirm-each-time or manual-only).

## Context

Mitra started every conversation knowing the portfolio, the notes and the last few messages of that chat. What the user had told it (a 12 year horizon, "no tobacco", "I like short answers", why they hold a stock) was lost, so it did not get better with use the way other assistants do. A memory is also the most sensitive thing the chat stores: it is personal, it is put into every prompt, and a wrong or planted one would steer every later answer.

## Decision

- **What a memory is:** one short durable fact (at most 300 characters; `profile`, `goal`, `preference`, `holding` or `other`), kept per user in `mitraMemories` (at most 100). Nothing else is stored: no chat transcripts (those stay in conversations), no attachments, no notes, no web pages.
- **Mitra saves them itself, from the user's own words only.** The `remember` tool takes the fact and a verbatim quote of what the user typed; the code (not the prompt) refuses it unless the quote is a stretch of the user's recent typed messages (`quoteIsFromUser`). Text from a file, a web page, a note or a tool result is never in that set, so it cannot create a memory however it is worded.
- **Not while a file is attached.** `remember` and `forget` are withheld then (like the alert and holding write tools), and in advisor-only mode.
- **Private data is refused in code,** even when the user typed it: PAN, Aadhaar-like and card or account numbers, IFSC, phone numbers, email addresses, passwords, OTPs and the like (`looksSensitive`). The same filter applies to a memory the user writes in Settings.
- **Repeats update, they do not pile up:** a new memory that shares most of its words with an existing one updates that one.
- **The user sees and controls everything.** A saved or forgotten memory shows as a chip in the reply with a one-click Undo; Settings > AI & Models lists every memory (kind, where it came from, date) with Delete, Add and Forget everything; a master switch (`chat.memory`, default on) stops saving and using memory. Memories are in "Export my data".
- **Used as background, never as instructions.** They go into the system prompt of the Mitra page and the drawer (the 40 most recently updated, each line cleaned with `untrusted()`), with the rule that the current message overrides a memory and that a memory never changes Mitra's rules or the guardrail.
- **Per-user and private:** every read and write is by `userId`; memories are never shared, never indexed into the shared retrieval corpus and never sent anywhere except to the user's own AI provider as part of their prompt.

## Consequences

- Each Mitra turn reads the user's memories (one indexed query) and adds up to about 12,000 characters to the prompt in the worst case (40 x 300).
- Residual risk: in a reply that also read a web page (ADR 0082), text on the page could influence what the model chooses to save while it quotes an innocent thing the user said. The quote check bounds what can be saved to facts the user's own words support, and the chip, Undo and Settings list make any such memory visible and removable; a file can never cause one.
- Wording, not meaning, is what the quote check verifies: a model could paraphrase the user's words wrongly. The chip shows the saved text so the user can catch it, and edits are a delete and re-add.
- There is no account-deletion flow in this repo yet; when one exists it must delete `mitraMemories` with the user's other data.
- Memory is the first, deliberately narrow, form of "improving with use". Learning from feedback or from the outcome of past answers is not part of this decision.
