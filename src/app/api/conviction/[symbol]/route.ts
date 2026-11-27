import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { deleteEntry } from '@/lib/conviction/store';

export async function DELETE(_request: Request, { params }: { params: Promise<{ symbol: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, data: null, error: 'Not authenticated' }, { status: 401 });
  const { symbol } = await params;
  try {
    const removed = await deleteEntry(userId, decodeURIComponent(symbol));
    if (!removed) return NextResponse.json({ success: false, data: null, error: 'No conviction entry for that symbol.' }, { status: 404 });
    return NextResponse.json({ success: true, data: { removed: true }, error: null });
  } catch (err) {
    console.error('[conviction] delete failed', err);
    return NextResponse.json({ success: false, data: null, error: 'Could not remove this entry.' }, { status: 500 });
  }
}
