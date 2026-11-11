import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEmailAlertStatus } from '@/lib/notifications/emailStatus';
import { setEmailAlertsEnabled } from '@/lib/userSettings';

export const dynamic = 'force-dynamic';

// Whether a triggered alert is also emailed (on by default), plus whether that email can actually be sent and the last outcome.

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, data: await getEmailAlertStatus(userId) });
}

const putSchema = z.object({ enabled: z.boolean() });

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });

  await setEmailAlertsEnabled(userId, parsed.data.enabled);
  return NextResponse.json({ success: true, data: await getEmailAlertStatus(userId) });
}
