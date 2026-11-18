import { NextResponse } from 'next/server';
import { getFundFacets } from '@/lib/funds/api';

// Public, read-only. Categories (with their sub-categories), fund houses and the
// NAV date the data is current to: the options behind the Funds filter panel.
export async function GET() {
  return NextResponse.json(await getFundFacets());
}
