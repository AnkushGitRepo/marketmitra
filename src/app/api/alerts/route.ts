import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { createAlertSchema } from '@/lib/alerts/schemas';
import { createAlert, listAlerts, upsertIpoWatch, upsertPortfolioRules } from '@/lib/alerts/store';
import type { AlertParams, IpoWatchParams, PortfolioRulesParams } from '@/lib/alerts/types';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const alerts = await listAlerts(userId);
  return NextResponse.json({ success: true, data: alerts });
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createAlertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }

  const d = parsed.data;

  // The IPO-watch subscription is one-per-user — upsert, don't stack.
  if (d.type === 'ipo_watch') {
    const alert = await upsertIpoWatch(userId, d.params as IpoWatchParams);
    return NextResponse.json({ success: true, data: alert }, { status: 200 });
  }

  // So are the portfolio rules.
  if (d.type === 'portfolio_rules') {
    const alert = await upsertPortfolioRules(userId, d.params as PortfolioRulesParams);
    return NextResponse.json({ success: true, data: alert }, { status: 200 });
  }

  const alert = await createAlert(userId, {
    type: d.type,
    symbol: 'symbol' in d && d.symbol ? d.symbol : null,
    params: d.params as Omit<AlertParams, 'type'>,
    note: d.note ?? null,
    rearm: d.rearm,
    cooldownMinutes: d.cooldownMinutes,
  });
  return NextResponse.json({ success: true, data: alert }, { status: 201 });
}
