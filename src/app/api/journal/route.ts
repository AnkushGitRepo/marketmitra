import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { deleteAllSnapshots, listSnapshots } from '@/lib/tradeJournal/store';

export const dynamic = 'force-dynamic';

/** The decision journal, newest first; `?symbol=` narrows it to one stock. */
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  const symbol = new URL(request.url).searchParams.get('symbol')?.trim().slice(0, 30) || undefined;
  try {
    return NextResponse.json({ success: true, data: await listSnapshots(userId, symbol), error: null });
  } catch (err) {
    console.error('[journal] list failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not load your journal.' }, { status: 500 });
  }
}

/** Deletes the user's whole journal. The Settings Danger zone asks for a typed confirmation first. */
export async function DELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: { removed: await deleteAllSnapshots(userId) }, error: null });
  } catch (err) {
    console.error('[journal] delete all failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not delete your journal.' }, { status: 500 });
  }
}
