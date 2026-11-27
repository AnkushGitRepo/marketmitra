import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { MAX_POST_MORTEM } from '@/lib/tradeJournal/snapshot';
import { setPostMortem } from '@/lib/tradeJournal/store';

const bodySchema = z.object({ postMortem: z.string().trim().max(MAX_POST_MORTEM).nullable() });

/** Writes the reflection on an entry. Nothing else about a snapshot can be changed. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  const { id } = await params;
  try {
    const entry = await setPostMortem(userId, id, parsed.data.postMortem);
    if (!entry) return NextResponse.json({ success: false, data: null, error: 'Journal entry not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: entry, error: null });
  } catch (err) {
    console.error('[journal] post-mortem failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not save this reflection.' }, { status: 500 });
  }
}
