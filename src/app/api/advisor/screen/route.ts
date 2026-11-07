import { NextResponse } from 'next/server';
import { advisorGate } from '@/lib/advisor/guard';
import { screenSymbol } from '@/lib/advisor/screen/fetch';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// GET /api/advisor/screen?symbol=TCS — the deterministic quality screen for
// one NSE symbol: every gate with its measured value, and whether the company
// is eligible. Read-only.

const SYMBOL = /^[A-Z0-9&-]{1,20}$/;

export async function GET(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const symbol = (new URL(request.url).searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!SYMBOL.test(symbol)) {
    return NextResponse.json({ success: false, error: 'symbol is required (NSE symbol, e.g. TCS).' }, { status: 422 });
  }
  const outcome = await screenSymbol(symbol, new Date().toISOString().slice(0, 10));
  if (!outcome.ok) {
    return NextResponse.json({ success: false, error: outcome.error }, { status: 502 });
  }
  return NextResponse.json({ success: true, data: outcome });
}
