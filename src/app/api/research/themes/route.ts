import { NextResponse } from 'next/server';
import { getScreenerFacets, runScreenerPage } from '@/lib/dashboard/screener';
import { themeSuggestions } from '@/lib/research/themeSuggestions';

export const dynamic = 'force-dynamic';

const MAX_QUERY = 80;

// Public and read-only (it only reads the screener data): themes and sectors matching `q`, with their company counts and top tickers.
export async function GET(request: Request) {
  const q = (new URL(request.url).searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
  try {
    const data = await themeSuggestions(q, { facets: () => getScreenerFacets(), page: runScreenerPage });
    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load themes.' }, { status: 502 });
  }
}
