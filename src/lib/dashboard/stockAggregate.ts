// Screener.in-style "everything about this ticker" aggregation (ADR 0024),
// shared by the MCP `get_company_fundamentals` tool (src/lib/mcp/tools.ts)
// and the public REST endpoint GET /api/stock/{ticker}
// (src/app/api/stock/[ticker]/route.ts) — one function, two callers, so the
// two stay in lockstep rather than duplicating this Promise.all in spirit.

import {
  getCompany,
  getDocuments,
  getFinancials,
  getPeers,
  getQuotes,
  getRatios,
  getShareholding,
  type CompanyOut,
  type DocumentOut,
  type LineItemOut,
  type PeerOut,
  type QuoteOut,
  type RatioOut,
  type ShareholdingOut,
  type StatementType,
} from './fundamentalsApi';

export const STOCK_AGGREGATE_SECTIONS = [
  'company',
  'quote',
  'ratios',
  'shareholding',
  'peers',
  'documents',
  'financials',
] as const;

export type StockAggregateSection = (typeof STOCK_AGGREGATE_SECTIONS)[number];

export interface StockAggregateFound {
  symbol: string;
  found: true;
  company?: CompanyOut;
  quote?: QuoteOut | null;
  ratios?: RatioOut[];
  shareholding?: ShareholdingOut[];
  peers?: PeerOut[];
  documents?: DocumentOut[];
  financials?: {
    profit_and_loss: LineItemOut[];
    balance_sheet: LineItemOut[];
    cash_flow: LineItemOut[];
  };
}

export interface StockAggregateNotFound {
  symbol: string;
  found: false;
  message: string;
}

export type StockAggregateResult = StockAggregateFound | StockAggregateNotFound;

export async function getStockAggregate(
  symbol: string,
  sections?: StockAggregateSection[]
): Promise<StockAggregateResult> {
  const want = (s: StockAggregateSection) => !sections || sections.includes(s);
  const company = await getCompany(symbol);
  if (!company) {
    return {
      symbol: symbol.toUpperCase(),
      found: false,
      message:
        "No data for that symbol — it may not be a symbol the fundamentals service recognises, or every source came up short. Try search_symbols/GET /api/search first.",
    };
  }

  const [quotes, ratios, shareholding, peers, documents, pnl, bs, cf] = await Promise.all([
    want('quote') ? getQuotes([symbol]) : Promise.resolve(null),
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
    quote: want('quote') ? (quotes?.[0] ?? null) : undefined,
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
  };
}
