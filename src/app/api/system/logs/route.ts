import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { listEvents, type EventLevel } from '@/lib/system/eventLog';

// System event log feed (ADR 0029) — backs the "Logs" panel on
// /dashboard/system. Not user-scoped data (it's operational, not personal),
// but still gated behind sign-in like the rest of /dashboard* — this app
// has no separate admin role, so "signed in" is the existing bar.

const LEVELS: EventLevel[] = ['info', 'warn', 'error'];

export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
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
