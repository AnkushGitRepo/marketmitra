import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CRITERION_METRICS } from '@/lib/analysts/criteria';
import { realDeps } from '@/lib/analysts/deps';
import { initiate } from '@/lib/analysts/engine';
import { releaseInitiate, tryClaimInitiate } from '@/lib/analysts/inFlight';
import { deleteAnalyst, getAnalyst, listJournal, setStatus, updateCriterion } from '@/lib/analysts/store';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
// Building a dossier is one model call, and a thinking model can take a minute.
export const maxDuration = 120;

type Ctx = { params: Promise<{ symbol: string }> };
const patchSchema = z.union([
  z.object({ status: z.enum(['active', 'paused']) }),
  z.object({ criterion: z.object({ id: z.enum(CRITERION_METRICS), action: z.enum(['enable', 'disable', 'remove']) }) }),
]);

const analyzeSchema = z.object({ action: z.literal('analyze') });

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
      criteria: analyst.criteria,
      lastCheckedAt: analyst.lastCheckedAt?.toISOString() ?? null,
      journal,
    },
  });
}

// Pause or resume, or switch one of the thesis criteria on or off or remove it. Resuming an analyst that never built its dossier sends it back to initializing.
export async function PATCH(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const { symbol } = await params;
  if ('criterion' in parsed.data) {
    const { id, action } = parsed.data.criterion;
    const criteria = await updateCriterion(userId, symbol, id, action);
    if (!criteria) return NextResponse.json({ success: false, error: 'No such criterion for this analyst' }, { status: 404 });
    return NextResponse.json({ success: true, data: { symbol: symbol.toUpperCase(), criteria } });
  }
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

/**
 * "Analyze now", "Retry" and "Generate dossier": builds this analyst's dossier immediately instead of waiting for the scheduled sweep. It is the same
 * initiation the worker runs, so it uses the user's own key and counts against the daily cap. A paused analyst can be built this way (#194).
 */
async function handlePOST(request: Request, { params }: Ctx) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  if (!analyzeSchema.safeParse(await request.json().catch(() => null)).success) return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 422 });
  const { symbol } = await params;
  const analyst = await getAnalyst(userId, symbol);
  if (!analyst) return NextResponse.json({ success: false, error: 'No analyst for this stock' }, { status: 404 });
  if (analyst.dossier) return NextResponse.json({ success: false, error: 'This analyst already has its dossier.' }, { status: 409 });
  if (!tryClaimInitiate(userId, analyst.symbol)) {
    return NextResponse.json({ success: false, error: 'This analyst is already being built.' }, { status: 409 });
  }
  try {
    const result = await initiate(analyst, realDeps());
    if (result === 'initiated') return NextResponse.json({ success: true, data: { symbol: analyst.symbol, result } });
    if (result === 'deferred') return NextResponse.json({ success: false, error: "Today's AI budget for analysts is used up. It resets tomorrow." }, { status: 409 });
    if (result === 'needs_key') return NextResponse.json({ success: false, error: 'no_ai_key' }, { status: 400 });
    const after = await getAnalyst(userId, symbol);
    return NextResponse.json({ success: false, error: after?.statusNote ?? 'The analyst could not finish the dossier. Try again.' }, { status: 502 });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not build the dossier. Try again.' }, { status: 500 });
  } finally {
    releaseInitiate(userId, analyst.symbol);
  }
}

export const POST = withRateLimit(handlePOST as Parameters<typeof withRateLimit>[0], 'ai');
