import { NextResponse } from 'next/server';
import { getCommodities } from '@/lib/commodities/getCommodities';

export const dynamic = 'force-dynamic';

/**
 * Public, read-only: Indian gold, silver and platinum prices (an estimate from international prices, the rupee rate and
 * the import duty, ADR 0086), the gold/silver ratio and the NSE gold and silver ETFs. A figure is null when its source
 * is down.
 */
export async function GET() {
  const data = await getCommodities();
  return NextResponse.json({ success: true, data });
}
