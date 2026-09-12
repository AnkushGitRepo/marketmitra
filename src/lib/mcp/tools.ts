// MarketMitra MCP tools (Phase 9, ADR 0019).
//
// Each tool is a thin, read-only wrapper over the existing
// `src/lib/dashboard/*` clients, which already talk to
// `services/fundamentals-api`. No new data access is implemented here.
//
// Design: every tool is `{ name, config, run }` where `run(args)` returns a
// plain JSON-serialisable object. `run` is what the unit tests exercise;
// `src/lib/mcp/server.ts` adapts these into `server.registerTool(...)` calls
// and formats the MCP `CallToolResult`.
//
// Scope (ADR 0019 §1): public data only. No portfolio / holdings / alerts /
// settings tools in v1 — those need an MCP auth design first.

import { z } from 'zod';
import {
  getCompany,
  getRatios,
  getShareholding,
  getPeers,
  getDocuments,
  getFinancials,
  getPrices,
  getIndices,
  getQuotes,
  searchSymbols,
  type StatementType,
  type PricePeriod,
} from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { getIpos, type IpoStatus } from '@/lib/dashboard/iposApi';
import { runScreener } from '@/lib/dashboard/screener';
import { screenerFiltersSchema } from '@/lib/dashboard/screenerSchema';

/** Framing appended to any tool touching AI-adjacent / market-sentiment data. */
const NOT_ADVICE = 'This is public reference data, not investment advice.';

const SYMBOL = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .describe('NSE trading symbol, e.g. "RELIANCE" or "TCS". Case-insensitive.');

const PRICE_PERIODS = ['1mo', '6mo', '1y', '5y'] as const;
const IPO_STATUSES = ['upcoming', 'open', 'closed', 'listed'] as const;
const FUNDAMENTAL_SECTIONS = [
  'company',
  'ratios',
  'shareholding',
  'peers',
  'documents',
  'financials',
] as const;

export interface McpToolDef<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  config: { title: string; description: string; inputSchema: S };
  run: (args: z.infer<S>) => Promise<unknown>;
}

/** Helper so `tools` stays a well-typed tuple while each entry keeps its own arg type. */
function defineTool<S extends z.ZodTypeAny>(def: McpToolDef<S>): McpToolDef<S> {
  return def;
}

const searchSymbolsTool = defineTool({
  name: 'search_symbols',
  config: {
    title: 'Search NSE symbols',
    description:
      'Search across every NSE-listed equity (~2,570) plus the tracked indices by company name or symbol prefix. Returns up to 15 matches. Use this to resolve a company name to a trading symbol before calling the other tools.',
    inputSchema: z.object({
      query: z.string().trim().min(1).max(80).describe('Company name or symbol prefix.'),
    }),
  },
  run: async ({ query }) => {
    const results = await searchSymbols(query);
    return { query, count: results.length, results };
  },
});

const getQuoteTool = defineTool({
  name: 'get_quote',
  config: {
    title: 'Get live quotes',
    description:
      'Batched near-real-time quote for one or more NSE symbols (and tracked index names): last price, previous close, day change %, 52-week high/low. Unknown symbols are dropped, never faked. Each row carries `source_tier`. Prices can be delayed and are not for execution.',
    inputSchema: z.object({
      symbols: z
        .array(SYMBOL)
        .min(1)
        .max(50)
        .describe('1–50 NSE symbols, or tracked index names like "NIFTY 50".'),
    }),
  },
  run: async ({ symbols }) => {
    const quotes = await getQuotes(symbols);
    const returned = new Set(quotes.map((q) => q.symbol.toUpperCase()));
    const missing = symbols.map((s) => s.toUpperCase()).filter((s) => !returned.has(s));
    return { count: quotes.length, quotes, missing, note: NOT_ADVICE };
  },
});

const getCompanyFundamentalsTool = defineTool({
  name: 'get_company_fundamentals',
  config: {
    title: 'Get company fundamentals',
    description:
      'Screener.in-style fundamentals for one NSE company: business description ("about"), named ratios, historical shareholding pattern (~12 quarters), peer comparison, annual-report document links, and historical financial statements (P&L, balance sheet, cash flow). Pick `sections` to narrow the response. Data comes from a free three-tier fallback chain; `source_tier` is on every record and some fields may be null when a source came up short.',
    inputSchema: z.object({
      symbol: SYMBOL,
      sections: z
        .array(z.enum(FUNDAMENTAL_SECTIONS))
        .optional()
        .describe(
          'Subset of: company, ratios, shareholding, peers, documents, financials. Omit for all.'
        ),
    }),
  },
  run: async ({ symbol, sections }) => {
    const want = (s: (typeof FUNDAMENTAL_SECTIONS)[number]) => !sections || sections.includes(s);
    const company = await getCompany(symbol);
    if (!company) {
      return {
        symbol: symbol.toUpperCase(),
        found: false,
        message:
          "No data for that symbol — it may not be a symbol the fundamentals service recognises, or every source came up short. Try search_symbols first.",
      };
    }

    const [ratios, shareholding, peers, documents, pnl, bs, cf] = await Promise.all([
      want('ratios') ? getRatios(symbol) : Promise.resolve(null),
      want('shareholding') ? getShareholding(symbol) : Promise.resolve(null),
      want('peers') ? getPeers(symbol) : Promise.resolve(null),
      want('documents') ? getDocuments(symbol) : Promise.resolve(null),
      want('financials')
        ? getFinancials(symbol, 'profit_and_loss' as StatementType)
        : Promise.resolve(null),
      want('financials')
        ? getFinancials(symbol, 'balance_sheet' as StatementType)
        : Promise.resolve(null),
      want('financials') ? getFinancials(symbol, 'cash_flow' as StatementType) : Promise.resolve(null),
    ]);

    return {
      symbol: company.symbol,
      found: true,
      company: want('company') ? company : undefined,
      ratios: want('ratios') ? (ratios ?? []) : undefined,
      shareholding: want('shareholding') ? (shareholding ?? []) : undefined,
      peers: want('peers') ? (peers ?? []) : undefined,
      documents: want('documents') ? (documents ?? []) : undefined,
      financials: want('financials')
        ? {
            profit_and_loss: pnl ?? [],
            balance_sheet: bs ?? [],
            cash_flow: cf ?? [],
          }
        : undefined,
      note: NOT_ADVICE,
    };
  },
});

const getPriceHistoryTool = defineTool({
  name: 'get_price_history',
  config: {
    title: 'Get price history',
    description:
      'Daily OHLCV price history for one NSE symbol over a fixed window (1mo, 6mo, 1y, or 5y). Newest row first. `source_tier` on every point.',
    inputSchema: z.object({
      symbol: SYMBOL,
      period: z
        .enum(PRICE_PERIODS)
        .default('1y')
        .describe('Look-back window. Default "1y".'),
    }),
  },
  run: async ({ symbol, period }) => {
    const points = await getPrices(symbol, period as PricePeriod);
    return {
      symbol: symbol.toUpperCase(),
      period,
      count: points?.length ?? 0,
      points: points ?? [],
    };
  },
});

const getNewsTool = defineTool({
  name: 'get_news',
  config: {
    title: 'Get market news',
    description:
      'Recent Indian-markets news headlines. With no `symbols`, returns the broad market stream; with `symbols`, returns news tagged to those companies. Each item has a VADER `sentiment` label — treat it as rough headline tone, NOT analysis and not a trading signal. Title/summary/link only; no article bodies. Use `cursor` from `next_cursor` to page.',
    inputSchema: z.object({
      symbols: z
        .array(SYMBOL)
        .max(20)
        .optional()
        .describe('Optional: up to 20 NSE symbols to filter news by. Omit for the broad stream.'),
      limit: z.number().int().min(1).max(50).default(20).describe('Items per page (1–50, default 20).'),
      cursor: z.string().optional().describe('Opaque pagination cursor from a previous `next_cursor`.'),
    }),
  },
  run: async ({ symbols, limit, cursor }) => {
    const page = await getNews({ symbols: symbols?.length ? symbols : undefined, limit, cursor });
    return {
      count: page.items.length,
      items: page.items,
      next_cursor: page.next_cursor,
      note: 'sentiment = headline tone (generic lexicon, skews optimistic on financial text), not analysis and not a signal.',
    };
  },
});

const listIposTool = defineTool({
  name: 'list_ipos',
  config: {
    title: 'List IPOs',
    description:
      'Indian mainboard & SME IPOs — calendar, price band, lot size, issue size, subscription, anchor status, key dates, and grey-market premium (GMP). GMP is an UNOFFICIAL third-party grey-market estimate, not from any exchange and not a prediction — surface it with that caveat. Filter by `status` (upcoming / open / closed / listed) or omit for all.',
    inputSchema: z.object({
      status: z
        .enum(IPO_STATUSES)
        .optional()
        .describe('Filter by lifecycle stage. Omit for all tracked IPOs.'),
    }),
  },
  run: async ({ status }) => {
    const ipos = await getIpos(status as IpoStatus | undefined);
    return {
      count: ipos.length,
      ipos,
      note: 'GMP fields are an unofficial grey-market estimate compiled by a third-party tracker — not an exchange figure, not a prediction. ' +
        NOT_ADVICE,
    };
  },
});

const getMarketIndicesTool = defineTool({
  name: 'get_market_indices',
  config: {
    title: 'Get market indices',
    description:
      'Current level, change, and change % for the tracked Indian market indices (NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX), each with a short spark series.',
    inputSchema: z.object({}),
  },
  run: async () => {
    const indices = await getIndices();
    return { count: indices?.length ?? 0, indices: indices ?? [], note: NOT_ADVICE };
  },
});

const runScreenerTool = defineTool({
  name: 'run_screener',
  config: {
    title: 'Screen stocks by financial criteria',
    description:
      'Filter the NSE stock universe by financial criteria — market cap, P/E, P/B, ROE, ROCE, dividend yield, debt/equity, sales/profit growth (3y CAGR), and sector. Same fixed-field min/max + sector-equality schema as the dashboard\'s Screener page (no free-form query expressions). Translate a natural-language screening question (e.g. "P/E under 15 and ROE over 20%") into `<field>_min`/`<field>_max` filters. Data is refreshed at most once daily from a bulk scrape, and excludes companies whose last scrape failed. Returns up to `limit` matches (default 100, capped 500), sorted by market cap descending — mention the Screener page for a fuller/adjustable view of a large result set.',
    inputSchema: screenerFiltersSchema,
  },
  run: async (filters) => {
    const results = await runScreener(filters);
    const capped = results.slice(0, 20);
    return {
      count: results.length,
      results: capped,
      truncated: results.length > capped.length,
      note: NOT_ADVICE,
    };
  },
});

export const tools: readonly McpToolDef[] = [
  searchSymbolsTool,
  getQuoteTool,
  getCompanyFundamentalsTool,
  getPriceHistoryTool,
  getNewsTool,
  listIposTool,
  getMarketIndicesTool,
  runScreenerTool,
];

export const toolNames = tools.map((t) => t.name);
