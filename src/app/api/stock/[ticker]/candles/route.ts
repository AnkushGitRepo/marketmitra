import { NextResponse } from 'next/server';
import { isHosted } from '@/lib/deployment-mode';
import { getCandles } from '@/lib/dashboard/yahooCandles';
import { isMarketOpen, isTimeframe, pollIntervalMs } from '@/lib/chart/timeframes';

export const dynamic = 'force-dynamic';

// Public, read-only (rate limited for every /api route by src/proxy.ts) market data like GET /api/stock/{ticker}/prices (ADR 0024). Candles for one timeframe (ADR 0069), oldest first.
// Without `last`: the timeframe's whole window. With `last`: only the newest bars, for the live poll. `pollMs` is how often the
// chart should ask again, decided here because the cadence differs between the hosted site and a local install.
const TICKER = /^[A-Za-z0-9&._-]{1,20}$/;
const MAX_LAST = 50;

const fail = (error: string, status: number) =>
  NextResponse.json({ success: false, data: null, error }, { status });

export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  if (!TICKER.test(ticker)) return fail('invalid_ticker', 400);
  const symbol = ticker.toUpperCase();

  const url = new URL(request.url);
  const interval = url.searchParams.get('interval');
  if (!isTimeframe(interval)) return fail('invalid_interval', 400);

  const lastParam = url.searchParams.get('last');
  const last = lastParam === null ? undefined : Number(lastParam);
  if (last !== undefined && (!Number.isInteger(last) || last < 1 || last > MAX_LAST))
    return fail('invalid_last', 400);

  try {
    const bars = await getCandles(symbol, interval, last);
    return NextResponse.json({
      success: true,
      data: {
        symbol,
        interval,
        bars,
        pollMs: pollIntervalMs(interval, isHosted()),
        marketOpen: isMarketOpen(new Date()),
      },
      error: null,
    });
  } catch {
    return fail('candles_unavailable', 502);
  }
}
