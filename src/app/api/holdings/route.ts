import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { addHolding, listHoldings } from '@/lib/holdings';
import { MAX_REASON } from '@/lib/tradeJournal/snapshot';
import { resyncUserHoldings } from '@/lib/rag/userSync';
import { createGuardrailAlertsForHolding } from '@/lib/alerts/guardrails';
import { autoSpawnForHolding } from '@/lib/analysts/spawn';

const createHoldingSchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  quantity: z.number().positive(),
  avgPrice: z.number().positive(),
  reason: z.string().trim().max(MAX_REASON).optional(),
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

  const { reason, ...input } = parsed.data;
  // The default guardrail alerts are created fire-and-forget (the holding is already saved, and a guardrail hiccup
  // must not turn into a failed add; see src/lib/alerts/guardrails.ts). The journal snapshot waits for them.
  const holding = await addHolding(userId, input, { reason, beforeSnapshot: (symbol) => createGuardrailAlertsForHolding(userId, symbol) });
  void resyncUserHoldings(userId);
  // Analyst Desk (ADR 0058): a new holding gets its own analyst; the cron builds the dossier.
  void autoSpawnForHolding(userId, holding.symbol);
  return NextResponse.json({ success: true, data: holding }, { status: 201 });
}
