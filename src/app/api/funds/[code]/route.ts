import { NextResponse } from 'next/server';
import { getFund, getFundFacets } from '@/lib/funds/api';
import { notFound, resolveSchemeCode, unavailable } from '@/lib/funds/http';

// Public, read-only. One scheme: latest NAV, returns, risk ratios and, when disclosed,
// expense ratio, AUM, exit load and manager. A figure that is null is unavailable, not zero.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const resolved = await resolveSchemeCode(params);
  if ('response' in resolved) return resolved.response;
  const fund = await getFund(resolved.code);
  if (fund) return NextResponse.json(fund);
  // The data service answers 404 for an unknown code and nothing at all when it is down; tell them apart.
  return (await getFundFacets()).categories.length > 0 ? notFound() : unavailable();
}
