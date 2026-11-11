import { NextResponse } from 'next/server';
import { requeueStalled } from '@/lib/analysts/store';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * "Retry all stalled": re-queues every analyst whose dossier build failed. It does not call the model itself: the scheduled sweep rebuilds them
 * one at a time under the daily cap, so this is instant and never fires many parallel model calls. Session only (#149, ADR 0058).
 */
async function handlePOST() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: { requeued: await requeueStalled(userId) } });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not re-queue the stalled analysts' }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, 'default');
