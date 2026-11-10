import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { generateInsightText } from '@/lib/ai/generate';
import { MARKET_SYSTEM } from '@/lib/ai/prompts';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { getIndices } from '@/lib/dashboard/fundamentalsApi';
import { getMarketOverview } from '@/lib/markets/marketOverview';
import { buildMarketPulsePrompt } from '@/lib/markets/marketPulse';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 60 * 60 * 1000;
const bodySchema = z.object({ force: z.boolean().optional() }).optional();

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const force = parsed.success ? parsed.data?.force : false;

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json(
      { success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 }
    );
  }

  const [indices, overview] = await Promise.all([getIndices(), getMarketOverview()]);
  const input = {
    indices: (indices ?? []).map((i) => ({ name: i.name, value: Number(i.value), changePct: Number(i.change_pct) })),
    breadth: overview.breadth,
    sectors: overview.sectors,
  };
  if (input.indices.length === 0 && !input.breadth && input.sectors.length === 0) {
    return NextResponse.json({ success: false, error: 'Market data is unavailable right now.' }, { status: 503 });
  }

  const result = await getOrGenerate({
    scope: 'market',
    key: 'market',
    userId,
    // Rounded so a one-tick move does not bust the cache.
    inputHash: hashInput({
      i: input.indices.map((x) => [x.name, Math.round(x.changePct * 10)]),
      b: input.breadth && [input.breadth.advances, input.breadth.declines],
      s: input.sectors.map((x) => [x.label, Math.round(x.changePct * 10)]),
    }),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const gen = await generateInsightText(aiConfig, MARKET_SYSTEM, buildMarketPulsePrompt(input));
      return gen.ok ? { content: gen.text, model: gen.model } : { error: gen.error };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');
