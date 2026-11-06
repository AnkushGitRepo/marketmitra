import { NextResponse, after } from 'next/server';
import { resolveInternalOrigin } from '@/lib/agents/internalOrigin';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { createRun, userHasActiveRun } from '@/lib/agents/store';
import { getCompany, getPrices } from '@/lib/dashboard/fundamentalsApi';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ symbol: z.string().trim().min(1).max(20) });

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  }
  const symbol = parsed.data.symbol.toUpperCase();

  // Per-user surface — the caller's own key (or the env key in self-host).
  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json(
      { success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 }
    );
  }

  if (await userHasActiveRun(userId)) {
    return NextResponse.json(
      { success: false, error: 'You already have an analysis in progress. Wait for it to finish.' },
      { status: 409 }
    );
  }

  const company = await getCompany(symbol);
  if (!company) {
    return NextResponse.json(
      { success: false, error: 'Could not load data for that symbol.' },
      { status: 502 }
    );
  }

  const prices = await getPrices(symbol, '1mo');
  const priceAtRun =
    (prices ?? []).map((p) => Number(p.close)).filter((c) => Number.isFinite(c) && c > 0).at(-1) ?? null;

  const id = await createRun({
    userId,
    symbol,
    companyName: company.name,
    sector: company.sector ?? null,
    priceAtRun,
  });

  // Kick the worker without blocking the response. The safety-net
  // workflow (agents-tick.yml) sweeps if this fetch is dropped.
  after(async () => {
    try {
      await fetch(new URL(`/api/agents/tick?id=${id}`, resolveInternalOrigin(process.env, request.url)), {
        method: 'POST',
        headers: process.env.CRON_SECRET
          ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {},
      });
    } catch {
      /* the sweep will pick it up */
    }
  });

  return NextResponse.json({ success: true, data: { id } }, { status: 202 });
}

export const POST = withRateLimit(handlePOST, 'ai');
