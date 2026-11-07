# MarketMitra

**A free, open-source, self-hostable financial dashboard for Indian markets** — portfolio, alerts, news, IPOs, a stock screener, and AI-assisted research. Built to serve a human dashboard *and* an AI agent from day one.

[![CI](https://github.com/AnkushGitRepo/marketmitra/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/AnkushGitRepo/marketmitra/actions/workflows/ci.yml)
[![CodeQL](https://github.com/AnkushGitRepo/marketmitra/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/AnkushGitRepo/marketmitra/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/github/license/AnkushGitRepo/marketmitra)](https://github.com/AnkushGitRepo/marketmitra/blob/main/LICENSE)

**[Live app](https://marketmitra-v2.vercel.app)** · **[Repository](https://github.com/AnkushGitRepo/marketmitra)** · **[Report a bug](https://github.com/AnkushGitRepo/marketmitra/issues/new/choose)** · **[Discussions](https://github.com/AnkushGitRepo/marketmitra/discussions)**

> MarketMitra has **no paid tier, no billing and no trial limits**, in hosted and self-hosted mode alike. All data comes from free sources. This is a young v2 rewrite — nothing in this wiki makes usage or reliability claims it can't back up.

---

## Start here

| I want to… | Go to |
| --- | --- |
| Run it on my machine or my own server | [Getting Started](Getting-Started) |
| Know what every environment variable does | [Configuration](Configuration) |
| Understand how the pieces fit together | [Architecture](Architecture) |
| Learn what each page of the app does | [Features](Features) |
| Find stocks with the screener | [Screener Guide](Screener-Guide) |
| Use the Mitra AI assistant | [Mitra Assistant](Mitra-Assistant) |
| Call the API or connect an AI agent | [API and MCP](API-and-MCP) |
| Deploy and keep it running | [Deployment](Deployment) · [Operations Runbook](Operations-Runbook) |
| Contribute code | [Development Guide](Development-Guide) |
| Understand why it was built this way | [Decision Records](Decision-Records) |
| Fix something that's broken | [Troubleshooting](Troubleshooting) |

## What it does

- **Dashboard & portfolio** — real Indian indices, the holdings you actually own, allocation, per-holding P&L and a full stock detail page (ratios, financials, shareholding, peers, annual-report PDFs, price history).
- **Screener** — filter the whole NSE universe by valuation, profitability, leverage and growth; quick screens, pagination, CSV export, shareable URLs.
- **Alerts** — price, %-move, 52-week, portfolio-P&L and IPO triggers, delivered in-app, by webhook and by email; plus protective stop-loss alerts.
- **News & IPOs** — a free-RSS markets feed with sentiment tags, and an IPO calendar with subscription data and grey-market premium (clearly labelled as an unofficial estimate).
- **Mitra** — a chat assistant (bring your own AI key) that can look things up, open pages, run screens for you and manage alerts — within strict limits. See [Mitra Assistant](Mitra-Assistant).
- **Research & multi-agent briefings** — structured research briefs, and four analyst agents plus a bull/bear debate that end in a balanced briefing. They **never** recommend a trade.
- **An API for agents** — every feature has a documented endpoint, plus an MCP server at `/api/mcp`.

## Two ways to run it

| | Hosted | Self-hosted |
| --- | --- | --- |
| Who it's for | Anyone who'd rather not run infrastructure | Anyone who wants their own instance |
| Sign-in | Clerk | None — single local user |
| AI features | Bring your own key | Bring your own key |
| Rate limits | Fair-use limits on the shared instance | None |
| Code | Identical | Identical |

One variable, `NEXT_PUBLIC_DEPLOYMENT_MODE`, selects the mode ([ADR 0010](Decision-Records)).

## Project status

All planned phases are built and live. What changed most recently: the screener now refreshes prices daily for every listed company and fundamentals incrementally, search ranks by ISIN/name/typo, and Mitra can build and open screens. See [Roadmap](Roadmap) for what's open.

## Not investment advice

MarketMitra synthesises public data. It does not give buy/sell/hold recommendations, price targets or predictions, and neither the app nor this wiki should be read as financial advice.
