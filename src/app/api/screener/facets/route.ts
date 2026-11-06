import { NextResponse } from 'next/server';
import { getScreenerFacets } from '@/lib/dashboard/screener';

// Public, read-only. `?sector=` narrows `industries` to that sector so the
// Screener's industry dropdown only offers industries that exist inside it.
export async function GET(request: Request) {
  const sector = new URL(request.url).searchParams.get('sector')?.trim().slice(0, 128);
  return NextResponse.json(await getScreenerFacets(sector || undefined));
}
