import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { convictionInputSchema, MAX_ENTRIES_PER_USER } from '@/lib/conviction/schema';
import { listEntries, upsertEntry } from '@/lib/conviction/store';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  try {
    return NextResponse.json({ success: true, data: await listEntries(userId), error: null });
  } catch (err) {
    console.error('[conviction] list failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not load your conviction board.' }, { status: 500 });
  }
}

/** Create or update the entry for a symbol; only the fields sent change. */
export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });

  const parsed = convictionInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, data: null, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 422 });
  }
  try {
    const entry = await upsertEntry(userId, parsed.data);
    if (!entry) {
      return NextResponse.json({ success: false, data: null, error: `Your board is full (${MAX_ENTRIES_PER_USER} entries).` }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: entry, error: null });
  } catch (err) {
    console.error('[conviction] upsert failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not save this entry.' }, { status: 500 });
  }
}
