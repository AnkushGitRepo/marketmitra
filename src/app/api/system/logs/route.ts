import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdminUser } from '@/lib/auth/admin';
import { listEvents, type EventLevel } from '@/lib/system/eventLog';

// System event log feed (ADR 0029) — backs the "Logs" panel on
// /system. Operational data (cron results, error messages), not
// per-user, but hosted sign-up is open to anyone — so it is restricted to the
// operator via ADMIN_USER_IDS (see lib/auth/admin.ts), not just "signed in".

const LEVELS: EventLevel[] = ['info', 'warn', 'error'];

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  if (!isAdminUser(userId)) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const levelParam = url.searchParams.get('level');
  const level = LEVELS.includes(levelParam as EventLevel) ? (levelParam as EventLevel) : undefined;
  const source = url.searchParams.get('source') ?? undefined;
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined;
  const beforeParam = url.searchParams.get('before');
  const before = beforeParam && !Number.isNaN(Date.parse(beforeParam)) ? new Date(beforeParam) : undefined;

  const events = await listEvents({ level, source, limit, before });
  return NextResponse.json({ success: true, data: events });
}
