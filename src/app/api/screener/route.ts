import { NextResponse } from 'next/server';
import { runScreenerPage } from '@/lib/dashboard/screener';
import { parseScreenerParams } from '@/lib/screener/params';

// Public, read-only market data — no auth, same deliberate bare-JSON
// exception already established for GET /api/search and GET /api/news
// (ADR 0025): a pass-through aggregate of already-public data, not a
// user-scoped/mutating resource, so it skips the standard
// {success,data,error} envelope. The body stays a plain array; the total
// number of matches (for pagination) is in the `X-Total-Count` header.
export async function GET(request: Request) {
  const parsed = parseScreenerParams(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'invalid_filter', message: parsed.message }, { status: 400 });
  }

  const { rows, total } = await runScreenerPage(parsed.filters);
  return NextResponse.json(rows, { headers: { 'X-Total-Count': String(total) } });
}
