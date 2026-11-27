# 0084 — The execution and review layer: conviction board, decision journal, cash, tax view

Status: accepted (2026-11-27, issues #410 to #414 and #419; the maintainer pasted a gap analysis and asked for all four pieces).

## Context

The app was strong at research and decision support but ended at the point of action: a stock found in the Screener had nowhere to wait, a bought position kept no record of why, the portfolio ignored cash, and returns were shown before tax.

## Decisions

- **Conviction board = the existing watchlists plus a conviction entry per symbol** (`convictionEntries`: tag, optional target price and direction, linked note), not a parallel list. A target keeps **one ordinary `price_threshold` alert** in step with it, so delivery, cooldown and the Alerts page are reused. Stocks only in the first version: the alert engine has no valuation (P/E) or fund NAV type yet.
- **The journal snapshot is taken in `lib/holdings.ts`**, so every path (Portfolio form, file import, Mitra's confirm card, the API) is covered. It is fire-and-forget and never fails the holding change; a source that is down leaves that field `null`, never an estimate. On an add, the default guardrail alerts are created first (`beforeSnapshot`) so the snapshot can list them.
- **What the journal lets the user change:** the app-recorded facts (price, P/E, ROCE, the thesis copy, guardrails) are read-only, so an entry cannot say something the data did not. The user's own words (reason, reflection) can be edited, and any entry or the whole journal can be deleted (typed `DELETE` in the Settings Danger zone), in line with ADR 0038 and 0050. An exit stores the live quote at removal, which is not a sale price: holdings record no sale price.
- **Cash is a small collection beside holdings** (`cashEntries`, at most 20). The what-if sandbox is pure arithmetic over the user's own numbers (`lib/portfolio/rebalance.ts`); nothing is saved or traded, and it is labelled as not a recommendation.
- **Tax rules are dated constants** (`lib/tax/india.ts`: short term 20%, long term 12.5% above Rs 1.25 lakh, long term after 12 months, as of the 23 July 2024 Budget) with the loss set-off rules. Output is an estimate, not tax advice, and says so. A holding without a purchase date is `term: null`, left out of totals and counted; it is never guessed.
- **Purchase dates live in their own collection** (`holdingPurchaseDates`), one per holding, so the holding model stayed untouched. A position bought in tranches is therefore one lot.
- **Realised gains are typed in, not stored**, because the app records no sales. Persisting them is a follow-up.
- **Mitra reads all four** through read-only tools (`executionTools.ts`), with the user's own words fenced by `untrusted()`; none can write.

## Consequences

- True per-lot tax tracking, realised-gain storage, mutual funds and IPOs on the board, and a P/E trigger each need new data or alert types and are follow-ups.
- When the Budget changes a rate, edit the constants and `RULES_AS_OF`.
- A removed holding leaves its purchase date behind; it is ignored because no holding matches it. There is no account-deletion flow yet; when one exists it must delete `convictionEntries`, `tradeJournal`, `cashEntries` and `holdingPurchaseDates`.

## Amendment, 2026-11-27 (issue #422): where each piece lives

The first version put the journal, cash and what-if, and the tax table at the bottom of `/portfolio`, which made the page long and mixed secondary workflows into the daily holdings view. They moved: `/portfolio` is value, allocation beside risk, holdings and news; **Cash & Liquid Funds** (`/portfolio/cash`) and **Tax & Harvesting** (`/portfolio/tax`) are reached from the profile menu and from links in the Holdings header; the decision journal sits with the stock it is about, in a pinned **Investment thesis & entry snapshot** card on the stock page's Agent journal tab. The thesis there is saved as an ordinary note titled "Thesis: SYMBOL" and tagged with the symbol, so the journal keeps copying the newest note that names the stock and nothing new is stored. APIs, the Mitra tools and the export are unchanged.
