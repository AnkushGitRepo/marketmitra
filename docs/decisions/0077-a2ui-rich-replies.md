# 0077 — Mitra rich replies with A2UI

Status: accepted (2026-11-24, issue #326; the maintainer asked for A2UI on the Mitra chat page after the clarifying-question work in ADR 0076).

## Context

A2UI 1.0 is Google's open protocol (Apache-2.0) for generative UI: an agent sends layout data (`createSurface`, `updateComponents`,
`updateDataModel`), and the app draws it with components from a catalogue it registered, so no code runs on the client. A portfolio overview reads
better as a card than as a paragraph. The risk is the usual one for model-written UI: the model could write the layout and, worse, the numbers.

A spike (2026-11-24) found: `@a2ui/react` 0.16.1 and `@a2ui/web_core` 0.16.1 declare a peer dependency on Zod 3, and this repo is on Zod 4; the v1.0 message
format is documented; the basic catalogue (Text, Row, Column, Card, Divider, List, Button, …) is enough for a read-only card. Left alone, npm nests a
private Zod 3.25.76, which the repo's dependency-review check rejects: GHSA-mrhx-c7xc-m3w5 (high, memory use when validating oversized collections) is fixed
only in Zod 4.6.6 and later, with no Zod 3 patch. `package.json` therefore overrides both A2UI packages to use the repo's own Zod (`"zod": "$zod"`, 4.6.7
today). The renderer was checked on Zod 4 in a browser (a stored card renders, with no console errors) and the surface builder is validated by the real
`MessageProcessor` in unit tests. The renderer is client-only (it needs `getServerSnapshot` to render on the server), which is why it loads with `ssr: false`.
The A2UI project's own skill notes that a React-only app can do without A2UI; we use it
because the maintainer asked for it and because it gives a stable, documented, validated format.

## Decision

- **Our server builds the surface, not the model.** `show_portfolio_snapshot` (`lib/ai/a2uiTools.ts`) loads the user's holdings and live quotes, computes the
  figures with the existing pure `portfolioMetrics`, and returns A2UI v1.0 messages built by `lib/mitra-chat/a2ui/portfolioSnapshot.ts`. The model only decides
  to call it. A holding without a live price shows `n/a` and is left out of value and P&L; a "100% Other" sector note (unknown sectors) is dropped.
- **The model sees text, not layout.** `toModelOutput` gives it the same figures as a short summary marked "already shown to the user"; the stored tool
  output keeps the messages so the chat can draw the card, also after a reload.
- **Registered components only.** The renderer (`components/mitra-chat/A2uiView.tsx`) uses the basic catalogue through `MessageProcessor`, themed with the app's
  tokens in CSS. Invalid messages or a render error draw nothing, and the text reply still stands. It is loaded on demand (`next/dynamic`), so only a reply
  with a card pays for it.
- **Opt-in.** A new preference `chat.richReplies` (default off, Settings > AI & Models). When off, the tool is not offered and the prompt does not mention it
  (`RICH_REPLIES_PROMPT` is appended only when on). Not offered in advisor-only mode, whose tool set is fixed on purpose. No new endpoint: the preference is
  part of `/api/settings/preferences`.
- **Guardrail unchanged.** The prompt tells the model to describe what the numbers show and never to say what to buy, sell, trim or add.

## Consequences

- One more tool and one more catalogue consumer to keep in step with A2UI releases (0.x packages, pinned exactly). The Zod override is outside what the A2UI
  project tests, so re-check the card in a browser on every A2UI upgrade, and drop the override if a release moves to Zod 4.
- A2UI actions (buttons that talk back to the agent) are not used yet. The Phase 1 question card (ADR 0076) stays a plain component.
- More cards (a stock snapshot, a screener result) would be new builders and tools on the same path; each gets its own review for what the model may and may not write.
- Hosted behaviour is unverified while Vercel is paused (`docs/POST-PAUSE-CHECKS.md` 4e), including that the CSP allows the renderer.
