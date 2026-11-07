import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advisorGate } from '@/lib/advisor/guard';
import { getPolicy } from '@/lib/advisor/policy/store';
import { computeMonthlyPlan } from '@/lib/advisor/allocation/core';

export const dynamic = 'force-dynamic';

// GET /api/advisor/plan — this month's deterministic plan. Optional query
// params describe state the app doesn't track yet: lumpSumTranchesDeployed,
// lastRebalancedOn, and the three sleeve values. Read-only: it proposes and
// never executes anything.

const querySchema = z.object({
  lumpSumTranchesDeployed: z.coerce.number().int().min(0).max(36).optional(),
  lastRebalancedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  indexCoreValueINR: z.coerce.number().min(0).optional(),
  satelliteValueINR: z.coerce.number().min(0).optional(),
  cashINR: z.coerce.number().min(0).optional(),
});

export async function GET(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const policy = await getPolicy(gate.userId);
  if (!policy) {
    return NextResponse.json({ success: false, error: 'Save an Investment Policy first.' }, { status: 409 });
  }
  const q = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!q.success) {
    return NextResponse.json({ success: false, error: 'Invalid query' }, { status: 422 });
  }
  const { indexCoreValueINR, satelliteValueINR, cashINR, ...rest } = q.data;
  const portfolio =
    indexCoreValueINR !== undefined || satelliteValueINR !== undefined || cashINR !== undefined
      ? {
          indexCoreValueINR: indexCoreValueINR ?? 0,
          satelliteValueINR: satelliteValueINR ?? 0,
          cashINR: cashINR ?? 0,
        }
      : null;

  const plan = computeMonthlyPlan({
    policy,
    asOf: new Date().toISOString().slice(0, 10),
    portfolio,
    ...rest,
  });
  return NextResponse.json({ success: true, data: plan });
}
