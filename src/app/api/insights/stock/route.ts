import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { generateInsightText } from '@/lib/ai/generate';
import { STOCK_SYSTEM } from '@/lib/ai/prompts';
import { buildStockPrompt } from '@/lib/ai/insightPrompts';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { gatherStockInput } from '@/lib/ai/stockInput';
import { promptForMode } from '@/lib/ai/promptMode';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 24 * 60 * 60 * 1000;
const bodySchema = z.object({ symbol: z.string().trim().min(1).max(20), force: z.boolean().optional() });

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const symbol = parsed.data.symbol.toUpperCase();

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json(
      { success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 }
    );
  }

  const mode = await resolvePromptMode(userId);
  const input = await gatherStockInput(symbol, userId);
  if (!input) {
    return NextResponse.json({ success: false, error: 'Could not load data for that symbol.' }, { status: 502 });
  }

  const result = await getOrGenerate({
    scope: 'stock',
    key: symbol,
    userId,
    // The mode is part of the cache key, so switching it never serves a stale verdict (or a stale refusal).
    inputHash: hashInput({ ...input, mode }),
    ttlMs: TTL_MS,
    force: parsed.data.force,
    generate: async () => {
      const gen = await generateInsightText(aiConfig, promptForMode(STOCK_SYSTEM, mode), buildStockPrompt(input));
      return gen.ok ? { content: gen.text, model: gen.model } : { error: gen.error };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');
