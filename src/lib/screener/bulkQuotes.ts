// Daily bulk price-derived refresh for the screener (see ADR 0033): one Yahoo
// request per 100 symbols instead of one scrape per company. Owns market cap,
// price, P/E, P/B and dividend yield; the stalest-first Screener.in job owns
// everything else (ROE, ROCE, debt/equity, growth, sector).

import { isFreshQuote } from '@/lib/dashboard/quoteFreshness';
import { fetchYahooQuoteChunk, fetchYahooTickerQuotes } from '@/lib/dashboard/yahooQuote';

export const QUOTE_CHUNK_SIZE = 100;
const INGEST_BATCH_SIZE = 500;
const RUPEES_PER_CRORE = 1e7;
// A yield above this is a Yahoo units glitch, not a real dividend.
const MAX_PLAUSIBLE_YIELD_PCT = 25;

export interface ScreenerQuoteRow {
  symbol: string;
  market_cap?: number;
  current_price?: number;
  pe?: number;
  pb?: number;
  dividend_yield?: number;
  /** The company's name from Yahoo; fills in an SME company that only has its symbol so far. */
  name?: string;
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Maps one Yahoo quote to the screener's units (market cap in ₹ crore,
 * yield as a raw percentage). Returns null when there's no usable symbol or
 * price — never a fabricated row. Non-positive P/E and P/B (loss-makers,
 * negative book value) are dropped rather than stored as meaningless
 * numbers, so "P/E under 20" can't match a loss-making company. */
export function toScreenerQuoteRow(quote: Record<string, unknown>): ScreenerQuoteRow | null {
  const raw = typeof quote.symbol === 'string' ? quote.symbol : '';
  const symbol = raw.replace(/\.(NS|BO)$/i, '').toUpperCase();
  const price = positive(quote.regularMarketPrice);
  if (!symbol || price === undefined) return null;

  const marketCap = positive(quote.marketCap);
  const dividendYield = positive(quote.dividendYield);
  const row: ScreenerQuoteRow = { symbol, current_price: price };
  const name = [quote.longName, quote.shortName].find((n): n is string => typeof n === 'string' && n.trim().length > 0);
  if (name) row.name = name.trim();
  if (marketCap !== undefined) row.market_cap = marketCap / RUPEES_PER_CRORE;
  const pe = positive(quote.trailingPE);
  if (pe !== undefined) row.pe = pe;
  const pb = positive(quote.priceToBook);
  if (pb !== undefined) row.pb = pb;
  if (dividendYield !== undefined && dividendYield <= MAX_PLAUSIBLE_YIELD_PCT) {
    row.dividend_yield = dividendYield;
  }
  return row;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** One company of the universe, as `GET /companies/master?board=all` lists it. */
export interface UniverseEntry {
  symbol: string;
  series?: string | null;
  is_sme?: boolean;
}

const SME_SERIES = new Set(['SM', 'ST']);

/** Yahoo often lists an NSE SME share under its series, as `ANONDITA-SM.NS`, not `ANONDITA.NS`. In a trial
 * run about half of the SME symbols (including the busiest) were missing under the plain ticker and all of
 * them were found under the suffixed one. Null for the main board or a series we do not know. */
export function seriesTicker(entry: UniverseEntry): string | null {
  const series = entry.series?.toUpperCase();
  if (!entry.is_sme || !series || !SME_SERIES.has(series)) return null;
  return `${entry.symbol.toUpperCase()}-${series}.NS`;
}

/** Quotes the universe. Main board: the plain `SYMBOL.NS` ticker. SME: only the series-suffixed ticker, and only a quote
 * that is still live. The plain ticker is not a fallback for SME: in a trial it returned a dead line (last traded
 * 2024-07-23, 84% more than 25% off NSE's price) for most SME symbols, so using it would store wrong prices. Yahoo
 * carries the suffixed ticker for about 84% of SME and gives a price but no market cap or P/E; Screener.in fills those in. */
export async function fetchScreenerQuoteRows(universe: readonly UniverseEntry[], now: Date = new Date()): Promise<ScreenerQuoteRow[]> {
  const rows: ScreenerQuoteRow[] = [];
  const main = universe.filter((u) => !u.is_sme).map((u) => u.symbol);
  for (const group of chunk(main, QUOTE_CHUNK_SIZE)) {
    for (const quote of await fetchYahooQuoteChunk(group)) {
      const row = toScreenerQuoteRow(quote);
      if (row) rows.push(row);
    }
  }

  const sme = universe.flatMap((u) => {
    const ticker = seriesTicker(u);
    return u.is_sme && ticker ? [{ ticker, symbol: u.symbol.toUpperCase() }] : [];
  });
  const symbolOf = new Map(sme.map((u) => [u.ticker, u.symbol]));
  for (const group of chunk(sme, QUOTE_CHUNK_SIZE)) {
    for (const quote of await fetchYahooTickerQuotes(group.map((u) => u.ticker))) {
      const symbol = symbolOf.get(String(quote.symbol ?? '').toUpperCase());
      if (!symbol || !isFreshQuote(quote, now)) continue;
      const row = toScreenerQuoteRow({ ...quote, symbol });
      if (row) rows.push(row);
    }
  }
  return rows;
}

export interface BulkQuoteResult {
  universe: number;
  quoted: number;
  ingested: number;
  skipped: number;
}

/** Pulls the whole universe (main board and SME) from fundamentals-api, quotes it, and posts
 * the rows to /screener/quotes. Throws on a configuration or ingest failure
 * so the cron route reports it instead of silently succeeding. */
export async function refreshScreenerQuotes(env: {
  baseUrl: string;
  token: string;
}): Promise<BulkQuoteResult> {
  const masterResponse = await fetch(`${env.baseUrl}/companies/master?board=all`, { cache: 'no-store' });
  if (!masterResponse.ok) throw new Error(`companies/master returned ${masterResponse.status}`);
  const universe = (await masterResponse.json()) as UniverseEntry[];

  const rows = await fetchScreenerQuoteRows(universe);
  let ingested = 0;
  let skipped = 0;
  for (const batch of chunk(rows, INGEST_BATCH_SIZE)) {
    const response = await fetch(`${env.baseUrl}/screener/quotes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.token}` },
      body: JSON.stringify({ rows: batch }),
    });
    if (!response.ok) throw new Error(`screener/quotes returned ${response.status}`);
    const result = (await response.json()) as { ingested: number; skipped: number };
    ingested += result.ingested;
    skipped += result.skipped;
  }
  return { universe: universe.length, quoted: rows.length, ingested, skipped };
}
