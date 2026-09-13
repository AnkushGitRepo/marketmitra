// Live "price right now" quotes via yahoo-finance2 (ADR 0024) — the primary
// source for getQuotes() in ./fundamentalsApi.ts. Server-only: the library
// itself can't run in a browser (CORS/cookie issues), so this must only ever
// be imported from a Server Component, route handler, or another
// server-only module — never a client component.

import YahooFinance from 'yahoo-finance2';
import type { QuoteOut } from './fundamentalsApi';

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
