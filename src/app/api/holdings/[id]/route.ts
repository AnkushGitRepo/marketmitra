import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { deleteHolding, updateHolding } from '@/lib/holdings';
import { resyncUserHoldings } from '@/lib/rag/userSync';
import { MAX_REASON } from '@/lib/tradeJournal/snapshot';

const updateHoldingSchema = z.object({
  quantity: z.number().positive(),
  avgPrice: z.number().positive(),
  reason: z.string().trim().max(MAX_REASON).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateHoldingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const { reason, ...input } = parsed.data;
  const holding = await updateHolding(userId, id, input, { reason });
  if (!holding) {
    return NextResponse.json({ success: false, error: 'Holding not found' }, { status: 404 });
  }
  void resyncUserHoldings(userId);
  return NextResponse.json({ success: true, data: holding });
}

const deleteBodySchema = z.object({ reason: z.string().trim().max(MAX_REASON).optional() });

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  // The body is optional: a plain DELETE (no body) still works. A reason is what the user wrote when they sold.
  const reason = deleteBodySchema.safeParse(await request.json().catch(() => ({})));
  const deleted = await deleteHolding(userId, id, { reason: reason.success ? reason.data.reason : undefined });
  if (!deleted) {
    return NextResponse.json({ success: false, error: 'Holding not found' }, { status: 404 });
  }
  void resyncUserHoldings(userId);
  return NextResponse.json({ success: true, data: null });
}
