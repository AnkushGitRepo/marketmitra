# 0082 — Web search in the Mitra chat

Status: accepted (2026-11-26, issue #401; the maintainer asked for it alongside notes and memory in Mitra, see #400 and #402).

## Context

The research reports can search the web (ADR 0081, #364) but the Mitra chat could answer only from the portfolio, the data tools and the indexed
corpus, so "what did the regulator say this week" or "any news on X" was out of reach. A chat also differs from a report: the user types freely, can
attach files, and Mitra holds private context (holdings, notes). A search query or a page address leaves the app, so what may go into one matters.

## Decision

- **Our own function tools, for every provider.** `web_search` and `fetch_page` from `lib/ai/research/webTools.ts` (DuckDuckGo HTML and Google News RSS,
  results sanitised and fenced as untrusted text), wrapped by `lib/mitra-chat/webTools.ts`. A provider's built-in search is not used in chat: it cannot always
  be combined with function tools (Gemini is the main case), and one set of tools behaves the same everywhere.
- **A small budget per reply:** 3 searches and 2 pages. The tools are built fresh for each request, so the budget and the allow-list below belong to that reply.
- **`fetch_page` opens only an address that came from a search in this reply or that the user typed.** Otherwise text from a page, a note or an attached file
  could tell the model to open `https://example.com/?d=<the user's holdings>` and carry data out in the address. The search query is bound by the prompt
  (public names only, never holdings, amounts or notes); an address is bound by code.
- **Withheld when a file is attached,** like the alert write tools, and in advisor-only mode (a fixed tool set on purpose).
- **A Settings switch** (`chat.webSearch`, Settings > AI & Models, default on) turns it off; the tools and the prompt section are then not offered at all.
- **Citations are required by the prompt:** the source and its date beside each web fact, and a "Sources:" line. The model is told to search only for what its
  data, the notes and the retrieved context do not hold, and to say plainly when a search found nothing.

## Consequences

- Chat questions that need fresh facts now take a few extra seconds and a few tool calls; the activity line shows "Searched the web" and "Read a web page".
- The keyless sources are best-effort (a public HTML page, an RSS feed): they can be rate-limited or change, in which case the tool says so and Mitra answers
  from what it has. The same limits as the research reports (docs/data-sources.md).
- Search queries go to DuckDuckGo and Google News. Only public names are meant to be in them; this is enforced by the prompt, not by code, so a query is the
  residual risk, and the switch is the user's control.
- Native provider search can be added later where a provider allows it next to function tools.
