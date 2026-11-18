import { NextResponse } from 'next/server';
import { getFundNav } from '@/lib/funds/api';
import { badRequest, resolveSchemeCode, unavailable } from '@/lib/funds/http';
import { NAV_RANGES, type NavRange } from '@/lib/funds/types';

// Public, read-only. Stored daily NAV for one scheme, oldest first. `?range=` is one of
// 1m, 6m, 1y (default), 3y, 5y, 10y, max. Values are the NAVs as published: a unit
// split shows as a step. 503 when the data service is down (an empty array only ever means no history stored).
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const resolved = await resolveSchemeCode(params);
  if ('response' in resolved) return resolved.response;
  const range = new URL(request.url).searchParams.get('range') ?? '1y';
  if (!(NAV_RANGES as readonly string[]).includes(range)) {
    return badRequest('invalid_range', `range must be one of ${NAV_RANGES.join(', ')}`);
  }
  const series = await getFundNav(resolved.code, range as NavRange);
  return series ? NextResponse.json(series) : unavailable();
}
