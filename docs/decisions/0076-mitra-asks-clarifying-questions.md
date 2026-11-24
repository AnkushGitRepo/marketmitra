# 0076 — Mitra asks a clarifying question before answering

Status: accepted (2026-11-24, issue #322; the maintainer approved building the question tool first and A2UI later, if at all).

## Context

Mitra answered straight away even when the best answer depends on something only the user knows (time horizon, risk appetite, which holding).
The request also mentioned A2UI 1.0 (Google's generative-UI protocol). A2UI lets an agent describe forms and cards that the app draws from a
component catalogue. Asking one question needs none of that, and `@a2ui/react` (0.x) needs Zod 3 where this repo is on Zod 4, so adopting it is a
separate decision, not part of this one.

## Decision

- **A new tool, `ask_user`** (`lib/ai/askUserTool.ts`, schema in `lib/mitra-chat/askUser.ts`): a question (up to 200 characters) and 2 to 6 options
  (label, optional description), single or multiple choice. It changes nothing, so it is not a write tool and the ADR 0022/0030 boundary is unchanged.
  It is exported apart from `buildChatTools`, so the older `/api/ai/chat` widget, which has no card, never receives it.
- **The turn ends at the question.** `streamChat` takes `stopAfterTool`; the Mitra workspace route sets it to `ask_user`, so the model cannot answer
  its own question. Advisor-only mode (a fixed tool set on purpose) does not get the tool.
- **The answer is an ordinary user message** ("question, newline, answer"), sent from the card. This keeps the server-authoritative history intact
  (the client still sends only a new user message; `sanitizeUserMessage` is unchanged), and because older turns lose their tool calls
  (`prepareModelMessages`), repeating the question makes the answer stand alone.
- **Saving:** a reply is stored if it has text or an `ask_user` call (`hasReplyContent`); before, a reply without text was dropped, which would have lost the card.
- **Card state is derived, not stored:** only the newest message, while the chat is idle, is answerable; any earlier card is read-only.
- **Prompt:** `MITRA_WORKSPACE_SYSTEM` says to ask only when the answer would change the reply and only the user can supply it, at most once per turn,
  and to write nothing after calling it. The no-investment-advice guardrail is untouched: a question only gathers context.

## Consequences

- No new dependency. A2UI can be added later behind its own ADR; the question card is a plain component and would be one entry in that catalogue.
- A model that ignores the prompt could ask too often; the prompt limits it and the user can always ignore the card and type a message.
- Hosted behaviour across providers is unverified while Vercel is paused (`docs/POST-PAUSE-CHECKS.md` 4d).
