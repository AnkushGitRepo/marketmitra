import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteAnalyst, getAnalyst, listJournal, setStatus } from '@/lib/analysts/store';
import { getCurrentUserId } from '@/lib/currentUserId';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ symbol: string }> };
const patchSchema = z.object({ status: z.enum(['active', 'paused']) });

const unauthorized = () => NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

export async function GET(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  const { symbol } = await params;
  const analyst = await getAnalyst(userId, symbol);
  if (!analyst) return NextResponse.json({ success: false, error: 'No analyst for this stock' }, { status: 404 });
  const journal = await listJournal(userId, symbol);
  return NextResponse.json({
    success: true,
    data: {
      symbol: analyst.symbol,
      source: analyst.source,
      status: analyst.status,
      statusNote: analyst.statusNote,
      dossier: analyst.dossier,
      lastCheckedAt: analyst.lastCheckedAt?.toISOString() ?? null,
      journal,
    },
  });
}

// Pause, or resume. Resuming an analyst that never built its dossier sends it back to initializing.
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const { symbol } = await params;
  const analyst = await getAnalyst(userId, symbol);
  if (!analyst) return NextResponse.json({ success: false, error: 'No analyst for this stock' }, { status: 404 });
  const next = parsed.data.status === 'active' && analyst.dossier === null ? 'initializing' : parsed.data.status;
  await setStatus(userId, symbol, next, null);
  return NextResponse.json({ success: true, data: { symbol: analyst.symbol, status: next } });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  const { symbol } = await params;
  const removed = await deleteAnalyst(userId, symbol);
  if (!removed) return NextResponse.json({ success: false, error: 'No analyst for this stock' }, { status: 404 });
  return NextResponse.json({ success: true, data: { symbol: symbol.toUpperCase(), removed: true } });
}
