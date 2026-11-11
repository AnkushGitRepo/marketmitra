import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { generateInsightText } from '@/lib/ai/generate';
import { NEWS_SYSTEM } from '@/lib/ai/prompts';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { getNews } from '@/lib/dashboard/newsApi';
import { buildNewsPulsePrompt } from '@/lib/news/feed';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 60 * 60 * 1000;
const HEADLINES = 20;
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

  const { items } = await getNews({ limit: HEADLINES });
  if (items.length === 0) {
    return NextResponse.json({ success: false, error: 'No headlines are available right now.' }, { status: 503 });
  }

  const result = await getOrGenerate({
    scope: 'news',
    key: 'news',
    userId,
    inputHash: hashInput(items.map((i) => i.url)),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const gen = await generateInsightText(aiConfig, NEWS_SYSTEM, buildNewsPulsePrompt(items, HEADLINES));
      return gen.ok ? { content: gen.text, model: gen.model } : { error: gen.error };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');
