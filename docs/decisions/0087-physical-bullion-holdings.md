# 0087 — Physical gold, silver and platinum holdings

Status: accepted (2026-11-28, issue #454; the maintainer asked for it after ADR 0086 settled where prices come from).

## Context

Indian investors hold metal as coins, bars and jewellery weight as well as ETFs. The ETFs already work as ordinary NSE holdings. Physical metal has no ticker, a weight instead of a quantity, a purity, and no live exchange price. The stock holding model (symbol, quantity, average price) and everything built on it (alerts, the decision journal, tax, RAG, Mitra) assumes an NSE symbol.

## Decisions

- **A separate collection, `bullionEntries`, beside the holdings, like cash (ADR 0084)**, not a new kind of stock holding. Each entry is `{ metal, purity (gold only: 24k or 22k), grams, buyPricePerGram (optional), note }`, at most 30 per user. This leaves every stock path untouched.
- **Valued at the estimated Indian price from ADR 0086**, per gram: gold 24K and 22K, silver 999, platinum 999. A missing price shows "No price", never zero, and the total says how many entries are unpriced.
- **Gain is shown only when a buy price was given** (a gift or an inheritance has none). No tax treatment: this is not stock tax and the tax view is unchanged.
- **Headline portfolio value and return stay stocks-only.** The metals value appears on its own page (`/portfolio/metals`, linked from the Holdings header) and as a **Precious metals slice in the allocation donut**, with a line saying the value and return above cover stocks only. Mixing an estimate into the headline return would make that number less exact for the sake of completeness.
- **The user owns the data:** every entry can be edited and removed, and the data export includes `bullion`.
- **Not done:** Mitra reading the user's own metals (the price tool values a weight stated in chat), alerts on metal prices, and account-deletion cleanup (there is no delete-account flow yet; when one exists it must remove `bullionEntries` with `cashEntries`).

## Consequences

- The numbers can be several percent off a jeweller's quote (making charges, local premium, purity), and the page says so.
- Gold ETFs and silver ETFs should still be added as stock holdings; they are not double counted because the metals page only holds physical weight.
