# 0057 — Structured briefs for the four Mitra widgets

Status: accepted (2026-11-11, issue #125)

## Context

The dashboard AI Daily Brief, Markets Mitra Market Pulse, News pulse and IPO brief each returned a dense paragraph, often restating
numbers already on the page. Investors scan for direction, drivers and risk triggers.

## Decision

- **One framework, four specs.** `src/lib/ai/briefSpecs.ts` defines each widget's fixed items (dashboard `return` / `exposure` /
  `risk`, market `breadth` / `leaders` / `catalyst`, news `earnings` / `macro` / `sector`, IPO `listing` / `offer` / `business` /
  `risk`) and its tone labels. `parseStructured` (tolerant: fences, truncation salvage, key variants, items keyed by name),
  `generateStructuredBrief` (12000-token budget, key-free failure log, a cut-off reply missing required items is not stored) and one
  `StructuredBriefCard` serve all four. The stored `content` is JSON; older prose caches are ignored.
- **Figures are computed, the model only words them** (`src/lib/ai/briefPrompts.ts`): today's rupee and % move, top contributor and
  detractor, largest holding and sector weight and active price alerts within 3% of triggering (dashboard); breadth, top and bottom
  sector and headlines, without index levels (markets); headlines with the tickers they contain (news); implied listing price from the
  price band, minimum investment, subscription and dates (IPO).
- **Tickers cannot be invented.** `[TICKER]` tags are kept only for tickers present in the supplied headlines; others are unwrapped, so
  the UI never links to a made-up stock page.
- **Guardrail.** Tones describe the data (positive / neutral / warning); no verdicts. The "no disclaimers" rule applies to the model's
  text; the UI renders the not-advice line itself (the project guardrail).
- **Not generated, because the data does not exist:** FII/DII flows (no free permitted source, ADR 0044); IPO valuation against peers
  and the fresh-issue / offer-for-sale split (no peer set, and `drhpExtract` is null). IPO `business` and `risk` come only from retrieved
  filings or news and otherwise say "not available". An IPO "attractive / fair / stretched" call would be an investment opinion and is
  not offered.
- Retired: `AiBriefCard`, `briefFromInsight` and the four prose prompt builders, with their tests.

## Consequences

- Each widget is cheaper to read and its numbers are checkable against the page.
- A thin data source shows up as a visible "not available" instead of confident filler.
- Adding a data source (flows, IPO peers) later means adding facts to the prompt builder, not changing the UI.
