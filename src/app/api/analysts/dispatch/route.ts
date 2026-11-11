import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderDispatchText } from '@/lib/analysts/dispatch';
import { previewDispatch, sendTestDispatch } from '@/lib/analysts/dispatchRun';
import { latestDispatch } from '@/lib/analysts/dispatchStore';
import { getCurrentUserId } from '@/lib/currentUserId';
import { describeEmailSkip, type EmailSkipReason } from '@/lib/notifications/emailPolicy';
import { withRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Analyst Desk morning brief (#129). Session only, like the other analyst endpoints.
const postSchema = z.object({ action: z.literal('test') });

const unauthorized = () => NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

/** The last saved brief and what today's would contain right now (nothing is sent). */
export async function GET() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  try {
    const now = new Date();
    const [latest, preview] = await Promise.all([latestDispatch(userId), previewDispatch(userId, now)]);
    return NextResponse.json({ success: true, data: { latest, preview: preview ? { ...preview, body: renderDispatchText(preview) } : null } });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not load the morning brief' }, { status: 500 });
  }
}

/** "Send test": emails today's preview (or a short test note) to the account address. Never saves a brief. */
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return unauthorized();
  if (!postSchema.safeParse(await request.json().catch(() => null)).success) return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 422 });
  try {
    const report = await sendTestDispatch(userId, new Date());
    const skip = report.email === 'skipped' && report.detail && ['disabled', 'provider_missing', 'no_address'].includes(report.detail) ? describeEmailSkip(report.detail as EmailSkipReason) : null;
    return NextResponse.json({ success: true, data: { email: report.email, message: skip ?? (report.email === 'sent' ? 'Test email sent.' : report.email === 'failed' ? 'The email could not be sent. Check Settings → Alerts for details.' : 'No email was sent.') } });
  } catch {
    return NextResponse.json({ success: false, error: 'Could not send the test' }, { status: 500 });
  }
}

export const POST = withRateLimit(handlePOST, 'default');
