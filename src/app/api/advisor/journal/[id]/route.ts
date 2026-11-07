import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advisorGate } from '@/lib/advisor/guard';
import { recordAction } from '@/lib/advisor/journal/store';

export const dynamic = 'force-dynamic';

// PATCH /api/advisor/journal/{id} — record what you actually did with a recommendation.

const bodySchema = z
  .object({
    action: z.enum(['followed', 'ignored', 'modified']),
    note: z.string().trim().max(500).optional(),
    actedAmountINR: z.number().min(0).max(1e9).optional(),
  })
  .refine((b) => b.action !== 'modified' || b.actedAmountINR !== undefined, {
    message: 'Say what amount you actually invested when you modify.',
    path: ['actedAmountINR'],
  });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ success: false, error: body.error.issues[0]?.message ?? 'Invalid request.' }, { status: 422 });
  }
  const { id } = await params;
  const entry = await recordAction(gate.userId, id, {
    action: body.data.action,
    note: body.data.note ?? null,
    actedAmountINR: body.data.actedAmountINR ?? null,
  });
  if (!entry) return NextResponse.json({ success: false, error: 'Entry not found.' }, { status: 404 });
  return NextResponse.json({ success: true, data: entry });
}
