# Features

A tour of the app, page by page. Routes are shown so you can find each one; the matching API endpoints are listed in [API and MCP](API-and-MCP).

## Dashboard — `/dashboard`
Your starting point: portfolio value and day change, an allocation chart, the tracked indices, and open IPOs.

## Portfolio — `/portfolio`
Holdings with live prices, allocation, concentration and per-holding P&L, plus an AI read of the portfolio (bring your own key). You can add holdings by hand or **import from a file** — a broker screenshot, an XLSX/CSV export, a DOCX or a PDF statement. Imports are previewed as a change list and only written after you confirm.

## Markets — `/markets`
Index quotes and your own **wishlists** (create several, add and remove stocks). The search bar finds any NSE-listed stock by **name, symbol or ISIN**, tolerates typos, and shows the sector; use ↑ ↓ and Enter to pick a result.

## Stock detail — `/stock/<symbol>`
Price chart workspace, valuation ratios, historical financials (P&L, balance sheet, cash flow), a 100%-stacked shareholding chart, peer comparison, an About section, annual-report PDFs, related news and an AI read.

## Index detail — `/index/<name>`
NIFTY 50, SENSEX, NIFTY BANK and INDIA VIX each have a page with live quote, 52-week range, price history and market news. Reach them from the index cards or via search.

## Screener — `/screener`
Filter the whole NSE universe. See the [Screener Guide](Screener-Guide).

## Alerts — `/alerts`
Create alerts on a stock or your whole portfolio:

| Type | Fires when |
| --- | --- |
| Price threshold | price goes above/below a level |
| Percent move | price moves up/down/either by N % |
| 52-week breach | price nears or crosses its 52-week high or low |
| Portfolio P&L | total value or unrealised P&L crosses a level |
| Trailing stop | price falls N % from its peak |
| Cumulative drawdown | price falls N % over a window of sessions |
| IPO | an IPO opens, reaches its last day, reaches allotment/listing, or its grey-market premium crosses a threshold — set per IPO, or as one standing watch for new IPOs |

Delivery: in-app notifications always; optionally webhook, email, and per-user Slack/Telegram/WhatsApp/webhook channels. Mitra can also create and adjust alerts for you — every such change is logged on the **Mitra activity** page.

## News — `/news`
A markets news stream from free RSS feeds with a headline-tone tag, filterable to your holdings. Only the headline, short summary, time and a link to the original are stored.

## IPOs — `/ipos`
Calendar, price band, lot size, live subscription figures and grey-market premium. **GMP is an unofficial third-party estimate** and is labelled as such; it shows "unavailable" rather than a guess when the source fails.

## Research — `/research`
A structured brief on a company, theme, portfolio or comparison, grounded in the same news-and-filings corpus as chat: *What it is · Recent developments · The numbers · Risks & watch-items · Open questions*.

## Agents — `/agents`
Multi-agent analysis of a stock: four analysts research different angles, a bull and a bear debate it, and a synthesis lays out both cases and where the evidence currently leans. Runs are asynchronous. It **stops before any trade decision** — there is no trader, risk-manager or execution step, by design.

## Notes — `/notes`
Private notes that Mitra and the research briefs can draw on; they're only ever visible to you.

## Mitra activity — `/mitra-activity`
An audit trail of every change Mitra made on your behalf, with the reason it gave.

## Settings — `/settings`
Your AI provider key (stored encrypted), notification channels and alert guardrails.

## System — `/system`
Operator view of service health and the event log. In hosted mode it is limited to users listed in `ADMIN_USER_IDS`; a public status page lives at `/status`.

## Mitra — the chat widget
Available on every dashboard page. See [Mitra Assistant](Mitra-Assistant).
