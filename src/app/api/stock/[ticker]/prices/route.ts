import { NextResponse } from 'next/server';
import { toBars } from '@/lib/chart/bars';
import { getPrices, type PricePeriod } from '@/lib/dashboard/fundamentalsApi';

export const dynamic = 'force-dynamic';

// Public, read-only market data like GET /api/stock/{ticker} (ADR 0024). Daily OHLCV bars, oldest first, ready for a
// chart. The stock page uses it to recover when the server-rendered history was empty (#64), so a transient upstream
// failure never leaves the chart blank until a manual reload.
const PERIODS: readonly PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const TICKER = /^[A-Za-z0-9&._-]{1,20}$/;

const fail = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

export async function GET(request: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  if (!TICKER.test(ticker)) return fail('invalid_ticker', 400);
  const symbol = ticker.toUpperCase();

  const requested = new URL(request.url).searchParams.get('period') ?? '5y';
  if (!PERIODS.includes(requested as PricePeriod)) return fail('invalid_period', 400);
  const period = requested as PricePeriod;

  try {
    const points = await getPrices(symbol, period);
    // `null` means the upstream failed; an empty array means it answered with no rows. Both are "no history",
    // but only a failure is worth retrying, so it is reported as 502 (retryable) and not as an empty success.
    if (points === null) return fail('price_history_unavailable', 502);
    return NextResponse.json(
      { success: true, data: { symbol, period, bars: toBars(points) }, error: null },
      { headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=300' } }
    );
  } catch {
    return fail('price_history_unavailable', 502);
  }
}
