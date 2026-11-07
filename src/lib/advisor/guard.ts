import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdvisorEnabled } from './flag';
import { hasAcknowledged } from './policy/store';

type Ok = { ok: true; userId: string };
type Refused = { ok: false; response: NextResponse };

/** Every advisor API route starts here. With the flag off the route does not
 * exist (404, no body that hints at the feature); `requireAck` additionally
 * demands the disclaimer has been accepted. */
export async function advisorGate(opts: { requireAck?: boolean } = {}): Promise<Ok | Refused> {
  if (!isAdvisorEnabled()) {
    return { ok: false, response: new NextResponse(null, { status: 404 }) };
  }
  const userId = await getCurrentUserId();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 }),
    };
  }
  if (opts.requireAck && !(await hasAcknowledged(userId).catch(() => false))) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, error: 'Accept the Advisor disclaimer first.' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, userId };
}
