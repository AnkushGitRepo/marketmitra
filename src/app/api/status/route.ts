import { NextResponse } from 'next/server';
import { getSystemStatus } from '@/lib/system/health';

// Public system status (ADR 0029) — no auth, backs the public /status page
// and can be polled by anyone. Every check inside getSystemStatus() is
// itself time-boxed, so this always resolves quickly even when a
// dependency is unreachable.

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await getSystemStatus();
  return NextResponse.json({ success: true, data: status });
}
