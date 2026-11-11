import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { logEvent } from '@/lib/system/eventLog';
import { isHosted } from '@/lib/deployment-mode';
import { revokeToken } from '@/lib/tokens/store';

export const dynamic = 'force-dynamic';

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isHosted()) return NextResponse.json({ success: false, error: 'Access tokens are only used in hosted mode' }, { status: 400 });
  const { id } = await ctx.params;
  try {
    const revoked = await revokeToken(userId, id);
    if (!revoked) return NextResponse.json({ success: false, error: 'Token not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: { id, revoked: true } });
  } catch (e) {
    await logEvent({ level: 'error', source: 'tokens', message: 'Token revoke failed', meta: { error: e instanceof Error ? e.message : String(e) } });
    return NextResponse.json({ success: false, error: 'Could not revoke the token' }, { status: 500 });
  }
}
