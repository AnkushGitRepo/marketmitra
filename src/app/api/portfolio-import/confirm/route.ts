import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { addHolding, updateHolding } from '@/lib/holdings';
import { createGuardrailAlertsForHolding } from '@/lib/alerts/guardrails';

// ADR 0022, part D — the only route that actually writes a Mitra-proposed
// portfolio change. Reached only by an explicit "Add N holdings" click in
// ImportPreviewCard; there is no AI involvement here at all, and no other
// path to this write — the model is never given a holdings-write tool.
export const dynamic = 'force-dynamic';

const changeSchema = z.object({
  matchedSymbol: z.string().trim().min(1).max(20),
  action: z.enum(['create', 'update']),
  existingHoldingId: z.string().nullable(),
  after: z.object({
    quantity: z.number().positive(),
    avgPrice: z.number().positive(),
  }),
});

const bodySchema = z.object({
  changes: z.array(changeSchema).min(1).max(100),
});

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', message: 'Invalid request.' }, { status: 422 });
  }

  let succeeded = 0;
  const failedSymbols: string[] = [];

  for (const change of parsed.data.changes) {
    try {
      if (change.action === 'update' && change.existingHoldingId) {
        const updated = await updateHolding(userId, change.existingHoldingId, change.after);
        if (updated) succeeded++;
        else failedSymbols.push(change.matchedSymbol);
      } else {
        await addHolding(userId, { symbol: change.matchedSymbol, ...change.after });
        succeeded++;
        // New holding via bulk import — same default-guardrail treatment
        // as adding one by hand (src/lib/alerts/guardrails.ts).
        void createGuardrailAlertsForHolding(userId, change.matchedSymbol);
      }
    } catch {
      failedSymbols.push(change.matchedSymbol);
    }
  }

  return NextResponse.json({ success: true, data: { succeeded, failedSymbols } });
}

export const POST = withRateLimit(handlePOST, 'ai');
