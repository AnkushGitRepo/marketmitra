# 0054 — Unrestricted Mitra: an opt-in, local-only exception to "no investment advice"

Status: accepted (2026-11-11, issue #103; decided by the maintainer)

## Context

Mitra and the insights are guarded: `GUARDRAIL` (src/lib/ai/prompts.ts) forbids buy / sell / hold calls, price targets and "should you
invest" answers, and AGENTS.md states "Mitra/insights never give investment advice". The maintainer wants a way to get valuation
verdicts ("undervalued", "a reasonable price to buy") from their own local copy. Public, hosted advice raises regulatory risk
(in India, personalised recommendations can fall under SEBI's investment-adviser rules; this is a flag, not legal advice) and
the product promise is neutral information, so the exception must not reach the hosted site.

## Decision

- A per-user preference `chat.unrestricted` (default **false**) in Settings > AI & Models, shown **only when not hosted**, with a
  confirmation explaining what it does. Same posture as Mitra Advisor (ADR 0035, `ADVISOR_MODE`).
- **Enforced on the server, never in the UI.** `selectPromptMode({ hosted, unrestricted })` returns `unrestricted` only when
  `!hosted && unrestricted`. `resolvePromptMode(userId)` returns `guarded` immediately when hosted (it does not even read the stored
  value) and also when preferences cannot be read. `PATCH /api/settings/preferences` refuses `unrestricted: true` when hosted (403).
- **What changes:** `promptForMode(guardedPrompt, mode)` replaces the trailing `GUARDRAIL` with `UNRESTRICTED_RULES`: a reasoned
  valuation view and an opinion on whether the price looks reasonable, grounded **only** in the supplied data, with the numbers shown
  and what would change the view. It still must never invent data, never promise or guarantee returns, never give position sizes, and
  always ends with "This is an AI opinion generated from public data, not licensed investment advice. You make the decision."
  Applied to the floating chat, the full-page Mitra chat, the stock AI read and the new stock brief.
- **Stock brief (#103):** `POST /api/insights/stock-brief` returns up to 2 strengths and 1 watchpoint (JSON, parsed and validated).
  In unrestricted mode it may add `valuation` and `entry`; in guarded mode `sanitizeBrief` drops those fields even if the model
  emitted them. The cache key includes the mode, and the page reuses a cached brief only if it was written in the current mode.
  It spends the caller's own AI key, only on request (hosted never falls back to the operator's key, ADR 0018).
- A visible "Unrestricted · local only" badge is shown on the brief while the mode is on.
- AGENTS.md is updated: the rule is "by default; local-only opt-in per ADR 0054".

## Consequences

- The hosted site's behaviour is unchanged and cannot be switched, even by editing a request or a stored document.
- A local user who turns it on gets opinions that can be wrong; the disclaimer and the data-only rule limit, but do not remove, that.
- Mitra Advisor keeps its own stricter rules (no "buy this", no return promises) when its flag is on.
