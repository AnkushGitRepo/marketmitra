import { NextResponse } from 'next/server';
import { listFunds } from '@/lib/funds/api';
import { badRequest, unavailable } from '@/lib/funds/http';
import { parseFundParams } from '@/lib/funds/params';

// Public, read-only. The mutual fund screener (ADR 0068): Direct-Growth plans by
// default; filter by category, fund house, returns, risk and (when disclosed)
// expense ratio and AUM. Returns `{ total, limit, offset, items }`.
export async function GET(request: Request) {
  const parsed = parseFundParams(new URL(request.url).searchParams);
  if (!parsed.ok) return badRequest('invalid_filter', parsed.message);
  const page = await listFunds(parsed.filters);
  return page ? NextResponse.json(page) : unavailable();
}
