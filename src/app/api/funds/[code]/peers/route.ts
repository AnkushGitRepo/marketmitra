import { NextResponse } from 'next/server';
import { getFundPeers } from '@/lib/funds/api';
import { resolveSchemeCode, unavailable } from '@/lib/funds/http';

// Public, read-only. Funds in the same sub-category with the same plan and option,
// best 3-year return first (up to 8). Empty when the fund has no sub-category.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const resolved = await resolveSchemeCode(params);
  if ('response' in resolved) return resolved.response;
  const peers = await getFundPeers(resolved.code);
  return peers ? NextResponse.json(peers) : unavailable();
}
