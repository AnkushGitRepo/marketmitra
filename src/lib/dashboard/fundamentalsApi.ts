// Server-side client for services/fundamentals-api (ADR 0011). Called
// directly from Server Components / route handlers — not proxied through a
// Next.js API route, since we're consuming an already-documented service,
// not shipping a new one (see docs/architecture.md → "Dashboard app shell").
// Every value here can be null/empty: the fundamentals-api's own fallback
// chain can come up short (e.g. NSE blocked, Screener markup changed), and
// callers must handle that rather than assume data always arrives.

import { fetchYahooQuotes } from './yahooQuote';

const BASE_URL = process.env.FUNDAMENTALS_API_URL ?? 'http://localhost:8420';

export interface CompanyOut {
  symbol: string;
  name: string;
  industry: string | null;
  sector: string | null;
  about: string | null;
  source_tier: string | null;
}

export interface PeerOut {
  symbol: string;
  name: string;
  is_target: boolean;
  cmp: string | null;
  pe: string | null;
  market_cap: string | null;
  div_yield: string | null;
  net_profit_qtr: string | null;
  qtr_profit_var_pct: string | null;
  sales_qtr: string | null;
  qtr_sales_var_pct: string | null;
  roce_pct: string | null;
  as_of: string;
  source_tier: string;
}

export interface DocumentOut {
  document_type: string;
  title: string;
  url: string;
  period_end: string | null;
  source_tier: string;
}

export interface RatioOut {
  name: string;
  value: string | null;
  unit: string | null;
  as_of: string;
  source_tier: string;
}

export interface ShareholdingOut {
  category: string;
  percentage: string;
  quarter_end: string;
  source_tier: string;
}

export interface LineItemOut {
  label: string;
  period_type: string;
  period_end: string;
  value: string | null;
  unit: string;
  source_tier: string;
}

export interface PricePointOut {
  trade_date: string;
  open: string | null;
  high: string | null;
  low: string | null;
  close: string | null;
  volume: number | null;
  source_tier: string;
}

export interface IndexQuoteOut {
  name: string;
  value: string;
  change: string;
  change_pct: string;
  spark: number[];
}

export type StatementType = 'profit_and_loss' | 'balance_sheet' | 'cash_flow';
export type PricePeriod = '1mo' | '6mo' | '1y' | '5y';

async function getJson<T>(path: string, revalidateSeconds: number): Promise<T | null> {
  try {
    const response = await fetch(`${BASE_URL}${path}`, { next: { revalidate: revalidateSeconds } });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    // fundamentals-api unreachable (not running, network issue, etc.) —
    // callers treat null as "no data available," not a crash.
    return null;
  }
}

export function getCompany(symbol: string): Promise<CompanyOut | null> {
  return getJson<CompanyOut>(`/companies/${symbol}`, 3600);
}

export function getRatios(symbol: string): Promise<RatioOut[] | null> {
  return getJson<RatioOut[]>(`/companies/${symbol}/ratios`, 3600);
}

export function getShareholding(symbol: string): Promise<ShareholdingOut[] | null> {
  return getJson<ShareholdingOut[]>(`/companies/${symbol}/shareholding`, 3600);
}

export function getPeers(symbol: string): Promise<PeerOut[] | null> {
  return getJson<PeerOut[]>(`/companies/${symbol}/peers`, 3600);
}

export function getDocuments(symbol: string): Promise<DocumentOut[] | null> {
  return getJson<DocumentOut[]>(`/companies/${symbol}/documents`, 3600 * 24);
}

export function getFinancials(symbol: string, statementType: StatementType): Promise<LineItemOut[] | null> {
  return getJson<LineItemOut[]>(`/companies/${symbol}/financials/${statementType}`, 3600 * 6);
}

export function getPrices(symbol: string, period: PricePeriod): Promise<PricePointOut[] | null> {
  return getJson<PricePointOut[]>(`/companies/${symbol}/prices?period=${period}`, 900);
}

export function getIndices(): Promise<IndexQuoteOut[] | null> {
  return getJson<IndexQuoteOut[]>('/indices', 300);
}

export interface QuoteOut {
  symbol: string;
  price: string | null;
  prev_close: string | null;
  change_pct: string | null;
  week52_high: string | null;
  week52_low: string | null;
  as_of: string;
  source_tier: string;
}

/** The fundamentals-api's own quote endpoint (NSE -> BSE, ADR 0024) —
 * `cache: 'no-store'` since the whole point is a fresh price each call; the
 * Python service already holds its own short in-process cache so this
 * doesn't hammer the upstream. Returns [] (never a fabricated price) on
 * failure. Kept as a private fallback behind yahoo-finance2 in getQuotes(). */
async function fetchFundamentalsApiQuotes(symbols: string[]): Promise<QuoteOut[]> {
  if (symbols.length === 0) return [];
  try {
    const response = await fetch(
      `${BASE_URL}/quote?symbols=${encodeURIComponent(symbols.join(','))}`,
      { cache: 'no-store' }
    );
    if (!response.ok) return [];
    return (await response.json()) as QuoteOut[];
  } catch {
    return [];
  }
}

/** Batched live "price right now" quote — used by the dashboard/portfolio UI
 * and the alerts engine (ADR 0014) alike. yahoo-finance2 is tried first
 * (ADR 0024); the fundamentals-api's own NSE -> BSE chain is the fallback
 * for whatever symbols it couldn't resolve. Never a fabricated price: a
 * symbol both sources come up short on is simply absent from the result. */
export async function getQuotes(symbols: string[]): Promise<QuoteOut[]> {
  const wanted = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (wanted.length === 0) return [];

  const fromYahoo = await fetchYahooQuotes(wanted);
  const missing = wanted.filter((s) => !fromYahoo.has(s));

  const fromFundamentalsApi = missing.length ? await fetchFundamentalsApiQuotes(missing) : [];
  const bySymbol = new Map(fromFundamentalsApi.map((q) => [q.symbol.toUpperCase(), q]));

  const result: QuoteOut[] = [];
  for (const symbol of wanted) {
    const quote = fromYahoo.get(symbol) ?? bySymbol.get(symbol);
    if (quote) result.push(quote);
  }
  return result;
}

export interface SearchResultOut {
  type: 'company' | 'index';
  symbol: string;
  name: string;
}

export async function searchSymbols(query: string): Promise<SearchResultOut[]> {
  // No caching: search results must reflect the live query string.
  try {
    const response = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(query)}`, { cache: 'no-store' });
    if (!response.ok) return [];
    return (await response.json()) as SearchResultOut[];
  } catch {
    return [];
  }
}
