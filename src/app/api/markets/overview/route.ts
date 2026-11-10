import { NextResponse } from 'next/server';
import { getMarketOverview } from '@/lib/markets/marketOverview';

export const dynamic = 'force-dynamic';

/** Public, read-only: NIFTY 50 breadth and NSE sectoral index moves. Fields are null / empty when the data source is down. */
export async function GET() {
  const data = await getMarketOverview();
  return NextResponse.json({ success: true, data });
}
