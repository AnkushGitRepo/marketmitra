# 0081 — The company research report is built from chapters, not one prompt

Status: accepted (2026-11-25, issue #360; the maintainer approved Gemini-only web grounding for the legal and regulatory chapters, with
"not available" for every other provider).

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
- **Chapters that need current outside facts are grounded or unavailable.** Regulation, litigation and governance have no stored source. They
  are written only with Google Search grounding, which this app wires for Gemini keys (`groundingTools`). With another provider the chapter
  says it is not available; it is never written from the model's memory. Stored facts (shareholding trend, ratios) are used where they exist.
- **Calls:** about five on the user's own key (business and management; the numbers commentary; sector, grounded; regulatory and legal,
  grounded; the risk register, which reads the others). The grounded ones are the slow and costly part, so a Gemini report is slower than one
  from another provider. Chapters stream to the page as they finish; the computed chapters appear first, before any model call returns.
- **Left out because the data does not exist:** EV/EBITDA (no cash line), segment revenue, subscriber or volume figures, promoter pledge.
  Chapters say "not available in our data" rather than infer them.

## Consequences

- A report costs several calls on the user's own key; the AI rate limit tier still applies per request, and a failed chapter can be retried alone.
- The other research modes (theme, portfolio, comparison) keep the single-call brief.
- Report numbers are testable without a model, and a model that ignores its format degrades one chapter, not the report.
- Valuation is only as good as the stored price history (about five years); a recently listed company gets no P/E history.

## Alternatives considered

- **One bigger prompt with a larger output budget:** still compresses, cannot be partially retried, and cannot stream.
- **Let the model compute the tables:** rejected; a number on a card must be traceable to stored data (as in #354).
- **Ground every chapter with web search:** slower and costlier for facts the data service already holds; used only where nothing is stored.
