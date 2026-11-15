import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advisorGate } from '@/lib/advisor/guard';
import { logEvent } from '@/lib/system/eventLog';
import { parseProfile } from '@/lib/advisor/diagnostics/profiles';
import { simulateDeployment } from '@/lib/advisor/diagnostics/deployment';
import { loadOverview } from '@/lib/advisor/diagnostics/overview';

export const dynamic = 'force-dynamic';

// GET /api/advisor/overview — the Advisor page as data: drift audit, drawdown review, the holdings-synced
// decision tracker and, when `amount` is given, the deployment view. Works with no saved policy (a preset
// applies). Read-only; recommend-only; nothing is executed.

const querySchema = z.object({
  profile: z.string().optional(),
  amount: z.coerce.number().min(0).max(1e9).optional(),
});

export async function GET(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const q = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) return NextResponse.json({ success: false, error: 'Invalid query' }, { status: 422 });

  try {
    const overview = await loadOverview(gate.userId, parseProfile(q.data.profile));
    const deployment =
      q.data.amount === undefined
        ? null
        : simulateDeployment({ holdings: overview.holdings, amountINR: q.data.amount, limits: overview.rules.limits, target: overview.rules.target });
    return NextResponse.json({ success: true, data: { ...overview, deployment } });
  } catch (error) {
    await logEvent({ level: 'error', source: 'advisor:overview', message: 'Request failed', meta: { error: error instanceof Error ? error.message : String(error) } });
    return NextResponse.json({ success: false, error: 'Could not load your portfolio.' }, { status: 500 });
  }
}
