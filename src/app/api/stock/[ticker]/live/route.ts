import { NextResponse } from 'next/server';
import { isHosted } from '@/lib/deployment-mode';
import { fetchYahooQuotes } from '@/lib/dashboard/yahooQuote';
import { isMarketOpen, pollIntervalMs } from '@/lib/chart/timeframes';
import { createTtlCache } from '@/lib/markets/ttlCache';
import type { QuoteOut } from '@/lib/dashboard/fundamentalsApi';

export const dynamic = 'force-dynamic';

// Rate limited for every /api route by src/proxy.ts. The stock page header's live price (ADR 0069): one quote, shared per process for a few seconds so many viewers cost one Yahoo call.
const TICKER = /^[A-Za-z0-9&._-]{1,20}$/;
const HOSTED_TTL_MS = 7_000;
const LOCAL_TTL_MS = 2_000;
const caches = {
  hosted: createTtlCache<QuoteOut | null>(HOSTED_TTL_MS),
  local: createTtlCache<QuoteOut | null>(LOCAL_TTL_MS),
};

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, data: null, error }, { status });

export async function GET(_request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  if (!TICKER.test(ticker)) return fail('invalid_ticker', 400);
  const symbol = ticker.toUpperCase();
  const hosted = isHosted();
  try {
    const quote = await (hosted ? caches.hosted : caches.local).get(
      symbol,
      async () => (await fetchYahooQuotes([symbol])).get(symbol) ?? null,
    );
    if (!quote) return fail('quote_unavailable', 502);
    return NextResponse.json({
      success: true,
      data: {
        symbol,
        price: Number(quote.price),
        prevClose: quote.prev_close === null ? null : Number(quote.prev_close),
        changePct: quote.change_pct === null ? null : Number(quote.change_pct),
        asOf: quote.as_of,
        // The header follows the Day candle's cadence.
        pollMs: pollIntervalMs('1d', hosted) / 2,
        marketOpen: isMarketOpen(new Date()),
      },
      error: null,
    });
  } catch {
    return fail('quote_unavailable', 502);
  }
}
