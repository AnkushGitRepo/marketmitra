import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateInsightText } from '@/lib/ai/generate';
import { promptForMode } from '@/lib/ai/promptMode';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';
import { STOCK_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { buildBriefPrompt, parseBrief, sanitizeBrief } from '@/lib/ai/stockBrief';
import { loadSignalBundle } from '@/lib/ai/stockSignalsServer';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { logEvent } from '@/lib/system/eventLog';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { withRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** A brief is reused for 24 hours per user, symbol and mode, so coming back to the page costs no tokens. */
const TTL_MS = 24 * 60 * 60 * 1000;
/**
 * Room for five points plus the hidden reasoning that "thinking" models spend from the same budget. 4096 was not enough: gemini-3.8-flash
 * used nearly all of it reasoning and was cut off after two points (#117). Only tokens actually used are billed.
 */
const MAX_OUTPUT_TOKENS = 12000;
const LOG_SNIPPET_CHARS = 600;
const MIN_EXPECTED_POINTS = 4;
const CUT_OFF_MESSAGE = 'Mitra ran out of room before finishing. Try again, or pick a model with a larger output limit.';
const bodySchema = z.object({ symbol: z.string().trim().min(1).max(20), force: z.boolean().optional() });

// Spends the caller's own AI key (BYOK): hosted uses the key saved in Settings and never the operator's;
// self-host uses the Settings key or the environment key. It only runs when the user asks for it.
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const symbol = parsed.data.symbol.toUpperCase();

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json({ success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' }, { status: 400 });
  }

  const mode = await resolvePromptMode(userId);
  const bundle = await loadSignalBundle(symbol);
  if (!bundle) return NextResponse.json({ success: false, error: 'Could not load data for that symbol.' }, { status: 502 });

  const result = await getOrGenerate({
    scope: 'stock_brief',
    key: symbol,
    userId,
    // The mode is part of the cache key, so switching it never serves a stale verdict (or a stale refusal).
    inputHash: hashInput({ signals: bundle.signals, news: bundle.context.news.map((n) => n.title), mode }),
    ttlMs: TTL_MS,
    force: parsed.data.force,
    generate: async () => {
      const gen = await generateInsightText(aiConfig, promptForMode(STOCK_BRIEF_SYSTEM, mode), buildBriefPrompt(bundle.context, bundle.signals), {
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      if (!gen.ok) return { error: gen.error };
      const brief = parseBrief(gen.text);
      if (!brief) {
        // Keep a short, key-free snippet so an unreadable answer can be diagnosed from the system log.
        await logEvent({
          level: 'warn',
          source: 'insights:stock-brief',
          message: 'Brief reply could not be parsed',
          meta: { symbol, model: gen.model, finishReason: gen.finishReason, length: gen.text.length, snippet: gen.text.slice(0, LOG_SNIPPET_CHARS) },
        });
        return { error: gen.finishReason === 'length' ? CUT_OFF_MESSAGE : 'Mitra returned an answer the page could not read. Try again.' };
      }
      const cutOff = gen.finishReason === 'length';
      if (cutOff || brief.points.length < MIN_EXPECTED_POINTS) {
        // Worth a trace either way: a short brief usually means the model ran out of room or skipped factors.
        await logEvent({
          level: cutOff ? 'warn' : 'info',
          source: 'insights:stock-brief',
          message: cutOff ? 'Brief was cut off by the output limit' : 'Brief had fewer points than expected',
          meta: { symbol, model: gen.model, finishReason: gen.finishReason, points: brief.points.length, length: gen.text.length, snippet: gen.text.slice(0, LOG_SNIPPET_CHARS) },
        });
      }
      // A cut-off brief with missing factors must not be cached for 12 hours as if it were complete.
      if (cutOff && brief.points.length < MIN_EXPECTED_POINTS) return { error: CUT_OFF_MESSAGE };
      return { content: JSON.stringify({ brief: sanitizeBrief(brief, mode), mode }), model: gen.model };
    },
  });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });

  const stored = JSON.parse(result.insight.content) as { brief: unknown; mode: string };
  return NextResponse.json({
    success: true,
    data: { brief: stored.brief, mode: stored.mode, generatedAt: result.insight.generatedAt },
    meta: { cached: result.cached },
  });
}

export const POST = withRateLimit(handlePOST, 'ai');
