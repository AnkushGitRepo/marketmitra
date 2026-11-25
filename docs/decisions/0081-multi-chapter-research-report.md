# 0081 — The company research report is built from chapters, not one prompt

Status: accepted (2026-11-25, issue #360). Amended the same day: the maintainer rejected "not available" as an answer. A gap is
sourced and stored where a free source exists (#365) and otherwise researched live by the agent with web search tools (#364), for every
provider.

## Context

The research brief (ADR 0020 amendment, #354) was one model call that returned a short summary and three lists. An initiating-coverage style
read needs depth on the business, the cash flow, the peers, the sector, regulation, legal and governance, management, valuation and risk,
and one prompt compresses that to a few sentences. The data service already stores more than the brief used: the balance sheet (borrowings,
reserves, total assets) and the cash-flow statement (operating cash flow, free cash flow, CFO/EBITDA), but the route passed only the P&L, so
the model said "balance sheet and cash flows not provided".

## Decision

- **Company mode becomes a report of chapters.** Each chapter is a typed unit (blocks plus optional prose plus a status) so the page can show
  them as they arrive and one failed chapter does not fail the report.
- **Numbers are computed, never generated.** The cash-flow and leverage tables, the P/E history and the scenarios are built from stored
  figures by pure functions (`lib/research/report/`): `statements` (P&L, balance sheet and cash flow joined by fiscal year, a half-year
  balance-sheet column excluded, a year missing from the data kept as an empty gap), `statementBlocks`, `valuation`, `valuationBlocks`.
  The model writes prose and the risk register only, and is given the same computed facts.
- **Scenarios are the company's own history, not a forecast.** Bear, base and bull are the lower quartile, median and upper quartile of its
  sales growth and operating margin on record, applied to the latest year (quartiles so one outlier year, such as a +49% jump, does not set
  the range). They carry no price, no target and no buy/sell/hold wording; the guardrail (ADR 0054/0070) applies unchanged.
- **Historical P/E is price at the fiscal year end over that year's EPS**, using the last close in the week up to the year end. A year with no
  price, no positive EPS or a ratio above 300 has no P/E, and at least three years are needed for a median. Prices and EPS are both adjusted
  for bonus issues in the stored data (checked on RELIANCE and TCS), so the ratio is consistent.
- **A fact is looked for in this order, and the report says "not found" only after the last step ran.**
  1. **Stored data**: the statements and ratios above, shareholding, peers.
  2. **Data we ingest from a free source** (issue #365, `docs/data-sources.md`): cash, debt and EV from Yahoo and the NSE/BSE XBRL, working-capital
     days and Screener's pros/cons, exchange announcements (credit ratings, Regulation 30 disclosures, litigation and auditor notices),
     SEBI/RBI/TRAI press-release feeds in the news corpus, promoter pledge from the shareholding XBRL, segment detail from the annual-report
     PDFs the service already indexes.
  3. **Retrieval** over the indexed news, filings and the user's notes (existing).
  4. **Web search by the agent** (issue #364): the provider's own search tool where the user's key has one (Anthropic, OpenAI, Google), and a
     keyless `web_search` + `fetch_page` pair (news search plus an SSRF-safe page reader, results fenced as untrusted) for every other provider.
  The report states what it searched when it still finds nothing, and never fills a gap from the model's memory.
- **Calls:** about five on the user's own key (business and management; the numbers commentary; sector; regulatory and legal; the risk register,
  which reads the others). Chapters that search are the slow part. Chapters stream to the page as they finish; the computed chapters appear
  first, before any model call returns.

## Consequences

- A report costs several calls on the user's own key; the AI rate limit tier still applies per request, and a failed chapter can be retried alone.
- The other research modes (theme, portfolio, comparison) keep the single-call brief.
- Report numbers are testable without a model, and a model that ignores its format degrades one chapter, not the report.
- Valuation is only as good as the stored price history (about five years); a recently listed company gets no P/E history.
- New storage (announcements, cash and debt, working-capital days) needs a migration; production migrations are run by the maintainer.
- Web search costs the user's own tokens and time, so it has a per-report budget of searches and page reads.

## Alternatives considered

- **One bigger prompt with a larger output budget:** still compresses, cannot be partially retried, and cannot stream.
- **Let the model compute the tables:** rejected; a number on a card must be traceable to stored data (as in #354).
- **Ground every chapter with web search:** slower and costlier for facts the data service already holds; used only after stored and ingested data.
- **"Not available" for providers without search:** rejected by the maintainer; every provider gets a search path.
