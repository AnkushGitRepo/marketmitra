import { NextResponse } from 'next/server';
import { z } from 'zod';
import { advisorGate } from '@/lib/advisor/guard';
import { computeMonthlyPlan } from '@/lib/advisor/allocation/core';
import { createEntry, listEntries } from '@/lib/advisor/journal/store';
import type { StoredKill } from '@/lib/advisor/journal/types';
import { getMemoById } from '@/lib/advisor/memo/store';
import { getPolicy } from '@/lib/advisor/policy/store';
import { getQuotes } from '@/lib/dashboard/fundamentalsApi';

export const dynamic = 'force-dynamic';

// GET  /api/advisor/journal → recorded recommendations, newest first
// POST /api/advisor/journal → record one: a stock from a memo, or this month's plan.
// Recording is not executing — nothing here touches a broker.

const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stock'), memoId: z.string().min(1), amountINR: z.number().gt(0).max(1e9) }),
  z.object({ kind: z.literal('plan') }),
]);

export async function GET() {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;
  return NextResponse.json({ success: true, data: await listEntries(gate.userId) });
}

export async function POST(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ success: false, error: 'Invalid request.' }, { status: 422 });

  if (body.data.kind === 'plan') {
    const policy = await getPolicy(gate.userId);
    if (!policy) return NextResponse.json({ success: false, error: 'Save an Investment Policy first.' }, { status: 409 });
    const plan = computeMonthlyPlan({ policy, asOf: new Date().toISOString().slice(0, 10) });
    const amount = plan.lines.filter((l) => l.kind === 'buy_index').reduce((a, l) => a + l.amountINR, 0);
    const entry = await createEntry(gate.userId, {
      kind: 'plan',
      symbol: 'PLAN',
      name: `Plan ${plan.month}`,
      priceAtTime: null,
      amountINR: amount,
      thesis: [plan.summary, ...plan.notes].join(' '),
      killCriteria: [],
      memoId: null,
      snapshot: { screen: null, plan },
    });
    return NextResponse.json({ success: true, data: entry });
  }

  const memo = await getMemoById(gate.userId, body.data.memoId);
  if (!memo) return NextResponse.json({ success: false, error: 'Memo not found.' }, { status: 404 });

  const quote = (await getQuotes([memo.symbol]).catch(() => []))[0];
  const price = quote?.price ? Number(quote.price) : null;
  const kills: StoredKill[] = [
    ...memo.memo.killCriteria.map((k) => ({
      description: k.description,
      metric: k.metric,
      operator: k.operator,
      threshold: k.threshold,
      consecutivePeriods: k.consecutivePeriods,
      periodUnit: k.periodUnit,
      source: 'memo' as const,
    })),
    ...memo.baselineKillCriteria.map((k) => ({ ...k, source: 'standing' as const })),
  ];
  const entry = await createEntry(gate.userId, {
    kind: 'stock',
    symbol: memo.symbol,
    name: memo.name,
    priceAtTime: price !== null && Number.isFinite(price) ? price : null,
    amountINR: body.data.amountINR,
    thesis: memo.memo.thesis.text,
    killCriteria: kills,
    memoId: memo.id,
    snapshot: { screen: memo.screen, plan: null },
  });
  return NextResponse.json({ success: true, data: entry });
}
