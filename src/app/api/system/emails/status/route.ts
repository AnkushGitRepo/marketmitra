import { NextResponse } from 'next/server';
import { isAdminUser } from '@/lib/auth/admin';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEmailDiagnosis } from '@/lib/email/status';

export const dynamic = 'force-dynamic';

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/** Operator-only: can outgoing email reach real users, and if not, why. Read-only. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  if (!isAdminUser(userId)) return err('Forbidden', 403);
  return NextResponse.json({ success: true, data: await getEmailDiagnosis(), error: null });
}
