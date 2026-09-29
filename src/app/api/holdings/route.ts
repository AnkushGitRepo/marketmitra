import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { addHolding, listHoldings } from '@/lib/holdings';
import { resyncUserHoldings } from '@/lib/rag/userSync';
import { createGuardrailAlertsForHolding } from '@/lib/alerts/guardrails';

const createHoldingSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  quantity: z.number().positive(),
  avgPrice: z.number().positive(),
});

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const holdings = await listHoldings(userId);
  return NextResponse.json({ success: true, data: holdings });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createHoldingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const holding = await addHolding(userId, parsed.data);
  void resyncUserHoldings(userId);
  // Fire-and-forget: the holding is already saved, and a guardrail hiccup
  // must not turn into a failed add. See src/lib/alerts/guardrails.ts.
  void createGuardrailAlertsForHolding(userId, holding.symbol);
  return NextResponse.json({ success: true, data: holding }, { status: 201 });
}
