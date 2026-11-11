import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isHosted } from '@/lib/deployment-mode';
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
  // Unrestricted Mitra exists only on a local instance (ADR 0054). It is also ignored when read back on the hosted site.
  if (isHosted() && parsed.data.chat?.unrestricted === true) return err('Unrestricted Mitra is not available on the hosted site', 403);
  try {
    return NextResponse.json({ success: true, data: await updatePreferences(userId, parsed.data), error: null });
  } catch {
    return err('Could not save preferences. Please try again.', 500);
  }
}
