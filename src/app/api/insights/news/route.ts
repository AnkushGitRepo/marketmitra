import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { NEWS_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { NEWS_SPEC } from '@/lib/ai/briefSpecs';
import { buildNewsBriefPrompt } from '@/lib/ai/briefPrompts';
import { generateStructuredBrief } from '@/lib/ai/structuredGenerate';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { getNews } from '@/lib/dashboard/newsApi';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 60 * 60 * 1000;
const HEADLINES = 20;
const bodySchema = z.object({ force: z.boolean().optional() }).optional();

// Mitra News Pulse (#125): three themes with a tone, and ticker tags limited to tickers present in the headlines.
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const force = parsed.success ? parsed.data?.force : false;

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json({ success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' }, { status: 400 });
  }

  const { items } = await getNews({ limit: HEADLINES });
  if (items.length === 0) {
    return NextResponse.json({ success: false, error: 'No headlines are available right now.' }, { status: 503 });
  }
  const { prompt, allowedTickers } = buildNewsBriefPrompt(items);

  const result = await getOrGenerate({
    scope: 'news',
    key: 'news',
    userId,
    // The version marker retires pre-#125 prose briefs.
    inputHash: hashInput({ v: 2, urls: items.map((i) => i.url) }),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const out = await generateStructuredBrief({ aiConfig, system: NEWS_BRIEF_SYSTEM, prompt, spec: NEWS_SPEC, allowedTickers });
      return 'error' in out ? out : { content: out.content, model: out.model };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');
