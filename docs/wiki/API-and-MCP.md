# API and MCP

Every feature in MarketMitra ships with a documented API endpoint next to its UI — the project treats an AI agent as a first-class consumer. This page is the orientation; the per-endpoint reference is in the repo and in the in-app explorer.

## Where the reference lives

| Resource | What it is |
| --- | --- |
| **`/dashboard/api`** | An in-app API explorer: endpoints grouped by tag, parameter tables, example responses, cURL / JavaScript / Python samples, and a "Try it out" form that calls the deployment with your session. |
| **`/openapi.json`** | The machine-readable OpenAPI spec. A test checks it against the real route handlers, so an undocumented route fails CI. |
| **[`docs/api-surface.md`](https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/api-surface.md)** | The written endpoint reference. |
| **`/llms.txt`** | A pointer file that tells an AI agent where everything is. |

## Conventions

- Most endpoints return the envelope `{ success, data, error }`. A few public, read-only aggregates deliberately return a bare array (for example `GET /api/screener`, `GET /api/search`).
- Input is validated at the boundary; bad input returns a 4xx with a clear message.
- Authenticated endpoints use the Clerk session in hosted mode; in self-host mode there is a single local user.
- **Public (no auth):** search, screener (+ facets and CSV export), stock aggregate, news, and the MCP server. **Per-user (auth):** holdings, alerts, wishlists, notes, notifications, settings, AI chat, research, insights, portfolio import.

## Endpoint groups

| Area | Examples |
| --- | --- |
| Market data | `GET /api/search`, `GET /api/stock/{ticker}`, `GET /api/news` |
| Screener | `GET /api/screener`, `GET /api/screener/facets`, `GET /api/screener/export` |
| Portfolio | `/api/holdings`, `/api/portfolio-import/extract` and `/confirm`, `/api/wishlists` |
| Alerts | `/api/alerts`, `/api/notifications`, `/api/settings/notifications`, `/api/mitra-activity` |
| AI | `POST /api/ai/chat`, `POST /api/research`, `POST /api/insights/{stock\|portfolio\|ipo}`, `/api/settings/ai` |
| Agents | `/api/agents/*` |
| Operations | `/api/status`, `/api/system/*`, `/api/cron/*` (bearer-secret, machine-to-machine) |

### The screener endpoint

`GET /api/screener` takes `<field>_min` / `<field>_max` for `market_cap`, `pe`, `pb`, `roe`, `roce`, `dividend_yield`, `debt_to_equity`, `sales_growth_3y_cagr`, `profit_growth_3y_cagr`, plus `sector`, `industry`, `q`, `sort_by`, `order`, `limit` (1–500) and `offset`. The body is a plain array; the total number of matches is in the **`X-Total-Count`** header.

```bash
curl -si "https://marketmitra-v2.vercel.app/api/screener?roe_min=15&debt_to_equity_max=1&sort_by=roe&limit=5"
```

## MCP server — `/api/mcp`

The supported way for an AI agent to use public market data. It is a stateless Streamable-HTTP [Model Context Protocol](https://modelcontextprotocol.io) server inside the Next.js app.

**Connect:** add `{ "url": "https://<your-host>/api/mcp" }` to your MCP client.

| Tool | Returns |
| --- | --- |
| `search_symbols` | up to 15 matches across NSE equities and indices |
| `get_quote` | live quotes for up to 50 symbols; unknown symbols are listed in `missing`, never invented |
| `get_company_fundamentals` | profile, ratios, shareholding, peers, documents, financials |
| `get_price_history` | OHLCV for `1mo`, `6mo`, `1y` or `5y` |
| `get_news` | headlines, optionally filtered by symbol |
| `list_ipos` | IPO calendar and subscription (GMP is flagged as an unofficial estimate) |
| `get_market_indices` | NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX |
| `run_screener` | the screener, with the true match count, compact rows and a coverage warning |
| `get_screener_options` | the exact sector and industry names the screener accepts |

All tools are **read-only and public**. There are no per-user tools over MCP (portfolio, alerts, settings) — that needs an MCP auth design first. Results that touch market data carry a "public reference data, not investment advice" note.

## Rate limits

Hosted mode applies fair-use limits per signed-in user, or per IP when anonymous. Self-hosted instances are never throttled.

| Tier | Signed in | Anonymous | Window |
| --- | --- | --- | --- |
| Default API | 120 | 30 | 60 s |
| AI routes (cost-bearing) | 15 | 6 | 60 s |
| MCP | 120 | 60 | 60 s |

Limits are backed by Upstash Redis and **fail open** — if the store is unreachable, requests are not blocked. The numbers are a starting point and are tuned in code (`src/lib/rateLimit.ts`).

## Adding an endpoint

A new feature needs a UI path **and** a documented endpoint together. Add the route handler, document it in `public/openapi.json` and `docs/api-surface.md`, and the OpenAPI test will tell you if you forgot. See the [Development Guide](Development-Guide).
