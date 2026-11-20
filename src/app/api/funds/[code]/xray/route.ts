import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { parseSchemeCode } from '@/lib/funds/types';
import { loadXray } from '@/lib/funds/xrayServer';

export const dynamic = 'force-dynamic';

// The Fund X-Ray findings for the signed-in user: role, how the fund sits against the sectors they hold, and
// cost and downside against the fund's peers. Plain computed numbers, no AI and no AI key needed.
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const raw = (await params).code;
  const code = parseSchemeCode(raw);
  if (code === null) {
    return NextResponse.json({ success: false, error: `scheme code must be a positive integer, got "${raw.slice(0, 20)}"` }, { status: 400 });
  }

  const loaded = await loadXray(userId, code);
  if (!loaded.ok) {
    return loaded.reason === 'not_found'
      ? NextResponse.json({ success: false, error: 'No mutual fund with that scheme code.' }, { status: 404 })
      : NextResponse.json({ success: false, error: 'The mutual fund data did not answer. Try again shortly.' }, { status: 503 });
  }
  return NextResponse.json({ success: true, data: { schemeCode: code, ...loaded.facts } });
}
