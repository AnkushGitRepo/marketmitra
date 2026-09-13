// Live "price right now" quotes via yahoo-finance2 (ADR 0024) — the primary
// source for getQuotes() in ./fundamentalsApi.ts. Server-only: the library
// itself can't run in a browser (CORS/cookie issues), so this must only ever
// be imported from a Server Component, route handler, or another
// server-only module — never a client component.

import YahooFinance from 'yahoo-finance2';
import type { PricePeriod, PricePointOut, QuoteOut } from './fundamentalsApi';

// One client instance reused across warm invocations so the library's
// internal cookie/crumb handshake against Yahoo isn't repeated on every
// request — same rationale/pattern as src/lib/mongodb.ts's cached client.
declare global {
  var _yahooFinanceClient: InstanceType<typeof YahooFinance> | undefined;
}

const yahooFinance = global._yahooFinanceClient ?? new YahooFinance();

if (process.env.NODE_ENV !== 'production') {
  global._yahooFinanceClient = yahooFinance;
}

// Mirrors services/fundamentals-api/app/ingestion/indices.py's TRACKED_INDICES
// exactly — a deliberate duplication (no shared package boundary between the
// two runtimes). Keep the two in sync by hand if either changes.
const TRACKED_INDICES: Record<string, string> = {
  'NIFTY 50': '^NSEI',
  SENSEX: '^BSESN',
  'NIFTY BANK': '^NSEBANK',
  'INDIA VIX': '^INDIAVIX',
};

function toYahooSymbol(symbol: string): string {
  const key = symbol.trim().toUpperCase();
  return TRACKED_INDICES[key] ?? `${key}.NS`;
}

/** The 4 index names the app tracks (dashboard/markets cards, search,
 * `/dashboard/index/[name]`) — the display name, not the Yahoo ticker. */
export const TRACKED_INDEX_NAMES = Object.keys(TRACKED_INDICES);

export function isTrackedIndexName(name: string): boolean {
  return name.trim().toUpperCase() in TRACKED_INDICES;
}

// yahoo-finance2's Quote is a union across instrument types (equity, ECN,
// option, ...) — only equities/indices carry these fields, so this reads
// them defensively off whatever came back rather than asserting the shape.
function toQuoteOut(originalSymbol: string, q: Record<string, unknown>): QuoteOut | null {
  const price = q.regularMarketPrice as number | undefined;
  if (price == null) return null; // never a fabricated price
  const prevClose = q.regularMarketPreviousClose as number | undefined;
  const changePct = q.regularMarketChangePercent as number | undefined;
  const week52High = q.fiftyTwoWeekHigh as number | undefined;
  const week52Low = q.fiftyTwoWeekLow as number | undefined;
  const time = q.regularMarketTime as Date | undefined;
  return {
    symbol: originalSymbol.trim().toUpperCase(),
    price: String(price),
    prev_close: prevClose == null ? null : String(prevClose),
    change_pct: changePct == null ? null : String(changePct),
    week52_high: week52High == null ? null : String(week52High),
    week52_low: week52Low == null ? null : String(week52Low),
    as_of: (time ?? new Date()).toISOString(),
    source_tier: 'yahoo_finance2',
  };
}

/** One quote per requested symbol, keyed by the caller's original spelling.
 * A symbol yahoo-finance2 couldn't resolve (network failure, unknown ticker,
 * no last price) is simply absent from the map — callers fall back to the
 * fundamentals-api chain for anything missing, never a fabricated price. */
export async function fetchYahooQuotes(symbols: string[]): Promise<Map<string, QuoteOut>> {
  const result = new Map<string, QuoteOut>();
  const settled = await Promise.allSettled(
    symbols.map(async (original) => {
      const quote = await yahooFinance.quote(toYahooSymbol(original));
      return { original, quote };
    })
  );

  for (const outcome of settled) {
    if (outcome.status !== 'fulfilled') continue;
    const mapped = toQuoteOut(outcome.value.original, outcome.value.quote as Record<string, unknown>);
    if (mapped) result.set(mapped.symbol, mapped);
  }

  return result;
}

const PERIOD_DAYS: Record<PricePeriod, number> = {
  '1mo': 31,
  '6mo': 186,
  '1y': 366,
  '5y': 1831,
};

/** Historical OHLCV for a tracked index, via yahoo-finance2's `chart()`.
 * Indices have no Postgres-backed price history — fundamentals-api's own
 * /indices route serves live quotes only, never caching to Postgres (see
 * its docstring) — so this fetches directly from Yahoo instead of proxying
 * through fundamentals-api. Shaped identically to `PricePointOut`, newest
 * first (matching /companies/{symbol}/prices' contract), so the existing
 * toRangeSeries()/LineChart machinery works unmodified. Returns [] (never
 * throws) on any failure — same "no data, not a crash" contract as the rest
 * of this module. */
export async function fetchIndexHistory(name: string, period: PricePeriod): Promise<PricePointOut[]> {
  const symbol = toYahooSymbol(name);
  const period1 = new Date(Date.now() - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000);
  try {
    const result = await yahooFinance.chart(symbol, { period1, interval: '1d' });
    return result.quotes
      .filter((q) => q.close !== null)
      .map((q) => ({
        trade_date: q.date.toISOString().slice(0, 10),
        open: q.open == null ? null : String(q.open),
        high: q.high == null ? null : String(q.high),
        low: q.low == null ? null : String(q.low),
        close: q.close == null ? null : String(q.close),
        volume: q.volume,
        source_tier: 'yahoo_finance2',
      }))
      .reverse();
  } catch {
    return [];
  }
}
