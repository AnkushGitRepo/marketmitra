# 0056 — The 360 brief: computed signals first, AI points second

Status: accepted (2026-11-11, issue #115)

## Context

The stock page brief was an empty card with a Generate button and a thin 2-strengths / 1-watchpoint output. An investor wants to see
quality, growth, valuation, smart-money flow and the main risk, with the numbers they rest on. Generic AI summaries (company history)
are noise, and an LLM must not invent figures.

## Decision

- **Compute the data panel, do not ask a model for it.** `buildSignals` (src/lib/stock/signals.ts, pure) turns data we already hold into
  valuation (P/E, derived P/B, peer-median P/E and the gap), quality (ROCE, ROE, debt/equity, free cash flow), growth (3-year sales and
  profit CAGR, latest-quarter YoY), ownership (promoter / FII / DII and their change), headline tone and technical position (vs the 52-week
  high and the 200-day average). The stock page renders it immediately from the data it has already loaded, with **no AI key and no extra
  request**. Anything we cannot compute is `null` and shown as "not available".
- **The AI part is five fixed points** (`quality`, `growth`, `valuation`, `ownership`, `risk`), each `{ key, signal, text }`, generated on
  demand with the user's own key (ADR 0018), from a prompt that lists every figure or "not available" and carries no company description.
  The parser tolerates fences and trailing disclaimers, maps bullish/bearish wording to the neutral signals, drops unknown or duplicate
  keys and caps lengths. Cached 12 hours per user, symbol and mode.
- **Guardrail:** `signal` describes a factor (`strength` / `neutral` / `concern`). Guarded mode labels them that way and never returns a
  verdict; the labels "Bullish / Bearish" and the `valuation` / `entry` view exist only in unrestricted mode (local only, ADR 0054), and
  `sanitizeBrief` removes verdict fields in guarded mode even if the model emitted them.
- **Data limits are stated, not papered over.** Not available from our free sources (ADR 0011): 5-year median P/E or P/B, EV/EBITDA,
  pledged-share percentage, interest coverage, concall takeaways, analyst notes. The panel says so; the prompt tells the model never to
  claim a historical median. Financial companies skip debt/equity and free cash flow (borrowings are their business). Some companies
  have a single P&L year, so their CAGRs read "not available". The source's `CFO/EBITDA` rows are a percentage labelled `INR_CR`, so they
  are not used.
- Replaces the 2-strengths / 1-watchpoint brief of #103. Older cached briefs have a different shape and are ignored (regenerated on request).

## Consequences

- The panel is accurate where the data is, and visibly incomplete where it is not; adding a data source later fills the same fields.
- Two reads of the same page can differ slightly from the written points if prices moved between generation and viewing; the panel always
  shows current numbers.
