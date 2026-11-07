import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advisorGate } from '@/lib/advisor/guard';
import { createMemo } from '@/lib/advisor/memo/service';
import { latestMemo } from '@/lib/advisor/memo/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST /api/advisor/memo  { symbol, allowIneligible? } → writes + stores a cited memo
// GET  /api/advisor/memo?symbol=TCS                    → the latest stored memo
// Analysis only: the memo describes a business and its risks; it never recommends a trade.

const SYMBOL = /^[A-Z0-9&-]{1,20}$/;
const bodySchema = z.object({
  symbol: z.string().trim().toUpperCase().regex(SYMBOL),
  allowIneligible: z.boolean().optional().default(false),
  // Optional filing overrides (https only; text capped at ~2M characters).
  filingUrl: z.string().url().startsWith('https://').max(2000).optional(),
  filingText: z.string().min(500).max(2_000_000).optional(),
});

export async function POST(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ success: false, error: 'symbol is required (NSE symbol, e.g. TCS).' }, { status: 422 });
  }
  const outcome = await createMemo(
    gate.userId,
    body.data.symbol,
    {
      allowIneligible: body.data.allowIneligible,
      filingUrl: body.data.filingUrl,
      filingText: body.data.filingText,
    },
    new Date().toISOString().slice(0, 10),
  );
  if (!outcome.ok) {
    return NextResponse.json(
      { success: false, error: outcome.error, issues: outcome.issues },
      { status: outcome.status },
    );
  }
  return NextResponse.json({ success: true, data: outcome.memo });
}

export async function GET(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const symbol = (new URL(request.url).searchParams.get('symbol') ?? '').trim().toUpperCase();
  if (!SYMBOL.test(symbol)) {
    return NextResponse.json({ success: false, error: 'symbol is required.' }, { status: 422 });
  }
  const memo = await latestMemo(gate.userId, symbol);
  return NextResponse.json({ success: true, data: memo });
}
