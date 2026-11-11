import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { MARKET_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { MARKET_SPEC } from '@/lib/ai/briefSpecs';
import { buildMarketBriefPrompt } from '@/lib/ai/briefPrompts';
import { generateStructuredBrief } from '@/lib/ai/structuredGenerate';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { getIndices } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { getMarketOverview } from '@/lib/markets/marketOverview';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 60 * 60 * 1000;
const HEADLINES = 6;
const bodySchema = z.object({ force: z.boolean().optional() }).optional();

// Mitra Market Pulse (#125): breadth, leaders and laggards, and a headline catalyst. No institutional-flow data exists (ADR 0044).
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const force = parsed.success ? parsed.data?.force : false;

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json({ success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' }, { status: 400 });
  }

  const [indices, overview, news] = await Promise.all([getIndices(), getMarketOverview(), getNews({ limit: HEADLINES }).catch(() => ({ items: [] }))]);
  const input = {
    indices: (indices ?? []).map((i) => ({ name: i.name, changePct: Number(i.change_pct) })),
    breadth: overview.breadth,
    sectors: overview.sectors,
    headlines: news.items.map((n) => ({ title: n.title })),
  };
  if (input.indices.length === 0 && !input.breadth && input.sectors.length === 0) {
    return NextResponse.json({ success: false, error: 'Market data is unavailable right now.' }, { status: 503 });
  }

  const result = await getOrGenerate({
    scope: 'market',
    key: 'market',
    userId,
    // Rounded so a one-tick move does not bust the cache; the version marker retires pre-#125 prose briefs.
    inputHash: hashInput({
      v: 2,
      i: input.indices.map((x) => [x.name, Math.round(x.changePct * 10)]),
      b: input.breadth && [input.breadth.advances, input.breadth.declines],
      s: input.sectors.map((x) => [x.label, Math.round(x.changePct * 10)]),
      h: input.headlines.map((x) => x.title),
    }),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const out = await generateStructuredBrief({ aiConfig, system: MARKET_BRIEF_SYSTEM, prompt: buildMarketBriefPrompt(input), spec: MARKET_SPEC });
      return 'error' in out ? out : { content: out.content, model: out.model };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');
