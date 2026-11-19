import { NextResponse } from 'next/server';
import { deleteRun } from '@/lib/chart/overlayRunsStore';
import { getCurrentUserId } from '@/lib/currentUserId';

export const dynamic = 'force-dynamic';

// Deletes one of the signed-in user's saved Auto-Chart runs (#253). Someone else's run answers the same 404 as a missing one.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId)
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const { id } = await params;
  try {
    if (!(await deleteRun(userId, id)))
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Could not delete this Auto-Chart.' },
      { status: 502 },
    );
  }
}
