import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateInsightText } from '@/lib/ai/generate';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';
import { CHART_OVERLAY_SYSTEM_GUARDED, CHART_OVERLAY_SYSTEM_UNRESTRICTED } from '@/lib/ai/prompts';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { buildOverlayPrompt, parseOverlay } from '@/lib/chart/aiOverlay';
import { toBars } from '@/lib/chart/bars';
import { getPrices } from '@/lib/dashboard/fundamentalsApi';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { withRateLimit } from '@/lib/rateLimit';
import { logEvent } from '@/lib/system/eventLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Overlays are reused for 12 hours per user, symbol and mode; the same bars cost no new tokens. */
const TTL_MS = 12 * 60 * 60 * 1000;
/** Room for the JSON plus the hidden reasoning a "thinking" model spends from the same budget (see stock-brief, #117). */
const MAX_OUTPUT_TOKENS = 8000;
const MIN_BARS = 30;
const LOG_SNIPPET_CHARS = 600;
const UNREADABLE_MESSAGE = 'Mitra returned chart levels the page could not read. Try again.';
const bodySchema = z.object({ symbol: z.string().trim().min(1).max(20), force: z.boolean().optional() });

// Spends the caller's own AI key (BYOK), only when the user turns Auto-Chart on. The mode comes from the server
// (resolvePromptMode), never from the request, so a hosted caller cannot obtain a trade setup.
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

  const bars = toBars((await getPrices(symbol, '1y')) ?? []);
  if (bars.length < MIN_BARS) return NextResponse.json({ success: false, error: 'Not enough price history to draw levels.' }, { status: 502 });

  const mode = await resolvePromptMode(userId);
  const result = await getOrGenerate({
    scope: 'chart_overlay',
    key: symbol,
    userId,
    // The mode and the latest bar are part of the key: switching mode, or a new trading day, never serves a stale overlay.
    inputHash: hashInput({ last: bars[bars.length - 1], count: bars.length, mode }),
    ttlMs: TTL_MS,
    force: parsed.data.force,
    generate: async () => {
      const system = mode === 'unrestricted' ? CHART_OVERLAY_SYSTEM_UNRESTRICTED : CHART_OVERLAY_SYSTEM_GUARDED;
      const gen = await generateInsightText(aiConfig, system, buildOverlayPrompt(symbol, bars), { maxOutputTokens: MAX_OUTPUT_TOKENS });
      if (!gen.ok) return { error: gen.error };
      const overlay = parseOverlay(gen.text, bars, mode);
      if (!overlay) {
        await logEvent({
          level: 'warn',
          source: 'insights:chart-overlay',
          message: 'Chart overlay reply could not be used',
          meta: { symbol, model: gen.model, finishReason: gen.finishReason, length: gen.text.length, snippet: gen.text.slice(0, LOG_SNIPPET_CHARS) },
        });
        return { error: UNREADABLE_MESSAGE };
      }
      if (mode === 'unrestricted' && !overlay.setup) {
        // Tells "the model sent none" from "validation dropped it" when a local user asks why no entry/stop/target appeared.
        await logEvent({
          level: 'info',
          source: 'insights:chart-overlay',
          message: 'Unrestricted overlay has no trade setup',
          meta: { symbol, model: gen.model, finishReason: gen.finishReason, snippet: gen.text.slice(0, LOG_SNIPPET_CHARS) },
        });
      }
      return { content: JSON.stringify({ overlay, mode }), model: gen.model };
    },
  });
  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });

  const stored = JSON.parse(result.insight.content) as { overlay: unknown; mode: string };
  return NextResponse.json({
    success: true,
    data: { overlay: stored.overlay, mode: stored.mode, generatedAt: result.insight.generatedAt },
    meta: { cached: result.cached },
  });
}

export const POST = withRateLimit(handlePOST, 'ai');
