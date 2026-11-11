import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { logEvent } from '@/lib/system/eventLog';
import { isHosted } from '@/lib/deployment-mode';
import { createTokenSchema } from '@/lib/tokens/pat';
import { TokenLimitError, createToken, listTokens } from '@/lib/tokens/store';

export const dynamic = 'force-dynamic';

// Personal access tokens (ADR 0053). Management is browser-session only: the proxy
// refuses any bearer token on /api/settings, so a token can never mint or list tokens.

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  // Self-host is already open (ADR 0010), so there is nothing for a token to unlock.
  if (!isHosted()) return NextResponse.json({ success: true, data: { enabled: false, tokens: [] } }, { headers: NO_STORE });
  try {
    return NextResponse.json({ success: true, data: { enabled: true, tokens: await listTokens(userId) } }, { headers: NO_STORE });
  } catch (e) {
    await logEvent({ level: 'error', source: 'tokens', message: 'Token list failed', meta: { error: e instanceof Error ? e.message : String(e) } });
    return NextResponse.json({ success: false, error: 'Could not load your tokens' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isHosted()) {
    return NextResponse.json({ success: false, error: 'Access tokens are only used in hosted mode; self-host is already open' }, { status: 400 });
  }
  const parsed = createTokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });

  try {
    const { token, view } = await createToken(userId, parsed.data);
    // The plaintext is shown exactly once; it is not stored and cannot be retrieved later.
    return NextResponse.json({ success: true, data: { token, ...view } }, { status: 201, headers: NO_STORE });
  } catch (e) {
    if (e instanceof TokenLimitError) return NextResponse.json({ success: false, error: e.message }, { status: 409 });
    await logEvent({ level: 'error', source: 'tokens', message: 'Token create failed', meta: { error: e instanceof Error ? e.message : String(e) } });
    return NextResponse.json({ success: false, error: 'Could not create the token' }, { status: 500 });
  }
}
