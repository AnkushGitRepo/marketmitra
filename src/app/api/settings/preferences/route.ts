import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { canUsePrivilegedModes } from '@/lib/auth/privilegedModes';
import { preferencesPatchSchema } from '@/lib/preferences/schema';
import { getPreferences, updatePreferences } from '@/lib/preferences/store';

export const dynamic = 'force-dynamic';

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

export async function GET() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return err('Not authenticated', 401);
  return NextResponse.json({ success: true, data: await getPreferences(userId), error: null });
}

export async function PATCH(request: Request) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return err('Not authenticated', 401);
  const parsed = preferencesPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err('Invalid preferences', 422);
  // Unrestricted Mitra is for a local instance or a hosted admin (ADR 0054, 0070). It is also ignored when read back for anyone else.
  if (!canUsePrivilegedModes(userId) && parsed.data.chat?.unrestricted === true) return err('Unrestricted Mitra is not available for this account', 403);
  try {
    return NextResponse.json({ success: true, data: await updatePreferences(userId, parsed.data), error: null });
  } catch {
    return err('Could not save preferences. Please try again.', 500);
  }
}
