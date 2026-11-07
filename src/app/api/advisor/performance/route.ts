import { NextResponse } from 'next/server';
import { advisorGate } from '@/lib/advisor/guard';
import { getPerformance } from '@/lib/advisor/performance/service';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/advisor/performance — every recorded stock recommendation treated as
// a paper purchase at that day's close, against the same rupees in a Nifty 50
// fund. Forward tracking only; no backtest. Read-only.
export async function GET() {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;
  const out = await getPerformance(gate.userId, new Date().toISOString().slice(0, 10));
  if (!out.ok) return NextResponse.json({ success: false, error: out.error }, { status: 502 });
  return NextResponse.json({ success: true, data: { benchmark: out.benchmark, ...out.report } });
}
