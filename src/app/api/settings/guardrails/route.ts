import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getAutoGuardrailsEnabled, setAutoGuardrailsEnabled } from '@/lib/userSettings';

// Whether adding a holding auto-creates the default trailing-stop +
// cumulative-drawdown pair (ADR 0030). On by default; this is the one
// off-switch for that behavior.

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const enabled = await getAutoGuardrailsEnabled(userId).catch(() => true);
  return NextResponse.json({ success: true, data: { enabled } });
}

const putSchema = z.object({ enabled: z.boolean() });

export async function PUT(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = putSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  await setAutoGuardrailsEnabled(userId, parsed.data.enabled);
  return NextResponse.json({ success: true, data: { enabled: parsed.data.enabled } });
}
