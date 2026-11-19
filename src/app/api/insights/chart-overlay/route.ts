import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateInsightText } from '@/lib/ai/generate';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';
import { CHART_OVERLAY_SYSTEM_GUARDED, CHART_OVERLAY_SYSTEM_UNRESTRICTED } from '@/lib/ai/prompts';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { buildOverlayPrompt, parseOverlay } from '@/lib/chart/aiOverlay';
import { toBars, type Bar } from '@/lib/chart/bars';
import { TIMEFRAMES, type Timeframe } from '@/lib/chart/timeframes';
import { getCandles } from '@/lib/dashboard/yahooCandles';
import { getPrices } from '@/lib/dashboard/fundamentalsApi';
import { getCurrentUserId } from '@/lib/currentUserId';
import { runForMode } from '@/lib/chart/overlayRuns';
import { listRuns, saveRun } from '@/lib/chart/overlayRunsStore';
import { withRateLimit } from '@/lib/rateLimit';
import { logEvent } from '@/lib/system/eventLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Room for the JSON plus the hidden reasoning a "thinking" model spends from the same budget (see stock-brief, #117). */
const MAX_OUTPUT_TOKENS = 8000;
const MIN_BARS = 30;
const LOG_SNIPPET_CHARS = 600;
const UNREADABLE_MESSAGE = 'Mitra returned chart levels the page could not read. Try again.';
const TIMEFRAME_IDS = TIMEFRAMES.map((t) => t.id) as [Timeframe, ...Timeframe[]];
const bodySchema = z.object({
  symbol: z.string().trim().min(1).max(20),
  interval: z.enum(TIMEFRAME_IDS).default('1d'),
});
const TICKER = /^[A-Za-z0-9&._-]{1,20}$/;

/** Day comes from the price history; every other timeframe from the candles the chart itself shows. Null when the source fails. */
async function loadBars(symbol: string, interval: Timeframe): Promise<Bar[] | null> {
  try {
    return interval === '1d'
      ? toBars((await getPrices(symbol, '1y')) ?? [])
      : await getCandles(symbol, interval);
  } catch {
    return null;
  }
}

// GET: the user's saved Auto-Chart runs for one stock and timeframe, newest first (#253). A trade setup in an old run is only returned
// while the caller is in unrestricted mode now (ADR 0068, 0070).
export async function GET(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId)
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const url = new URL(request.url);
  const symbol = (url.searchParams.get('symbol') ?? '').trim().toUpperCase();
  const interval = z.enum(TIMEFRAME_IDS).safeParse(url.searchParams.get('interval') ?? '1d');
  if (!TICKER.test(symbol) || !interval.success)
    return NextResponse.json(
      { success: false, error: 'Invalid symbol or interval' },
      { status: 422 },
    );

  try {
    const [runs, mode] = await Promise.all([
      listRuns(userId, symbol, interval.data),
      resolvePromptMode(userId),
    ]);
    return NextResponse.json({
      success: true,
      data: { runs: runs.map((r) => runForMode(r, mode)) },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Could not load saved Auto-Charts.' },
      { status: 502 },
    );
  }
}

// POST: generate a new Auto-Chart with the caller's own AI key (BYOK) and save it next to the earlier ones. Only runs when the user asks.
// The mode comes from the server (resolvePromptMode), never from the request, so a caller who may not have a trade setup never gets one.
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId)
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const symbol = parsed.data.symbol.toUpperCase();

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json(
      { success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 },
    );
  }

  const { interval } = parsed.data;
  const bars = await loadBars(symbol, interval);
  if (!bars || bars.length < MIN_BARS)
    return NextResponse.json(
      { success: false, error: 'Not enough price history to draw levels.' },
      { status: 502 },
    );

  const mode = await resolvePromptMode(userId);
  const system =
    mode === 'unrestricted' ? CHART_OVERLAY_SYSTEM_UNRESTRICTED : CHART_OVERLAY_SYSTEM_GUARDED;
  const gen = await generateInsightText(
    aiConfig,
    system,
    buildOverlayPrompt(symbol, bars, undefined, interval),
    { maxOutputTokens: MAX_OUTPUT_TOKENS },
  );
  if (!gen.ok) return NextResponse.json({ success: false, error: gen.error }, { status: 502 });

  const overlay = parseOverlay(gen.text, bars, mode, interval);
  const snippet = {
    symbol,
    model: gen.model,
    finishReason: gen.finishReason,
    length: gen.text.length,
    snippet: gen.text.slice(0, LOG_SNIPPET_CHARS),
  };
  if (!overlay) {
    await logEvent({
      level: 'warn',
      source: 'insights:chart-overlay',
      message: 'Chart overlay reply could not be used',
      meta: snippet,
    });
    return NextResponse.json({ success: false, error: UNREADABLE_MESSAGE }, { status: 502 });
  }
  if (mode === 'unrestricted' && !overlay.setup) {
    // Tells "the model sent none" from "validation dropped it" when a user asks why no entry/stop/target appeared.
    await logEvent({
      level: 'info',
      source: 'insights:chart-overlay',
      message: 'Unrestricted overlay has no trade setup',
      meta: snippet,
    });
  }

  try {
    const run = await saveRun({
      userId,
      symbol,
      interval,
      mode,
      overlay,
      model: gen.model,
      lastClose: bars[bars.length - 1].close,
    });
    return NextResponse.json({ success: true, data: { run: runForMode(run, mode) } });
  } catch {
    // The chart was generated but could not be kept; the user still gets to see it this once.
    return NextResponse.json({
      success: true,
      data: {
        run: {
          id: '',
          symbol,
          interval,
          mode,
          overlay,
          model: gen.model,
          lastClose: bars[bars.length - 1].close,
          createdAt: new Date().toISOString(),
        },
        saved: false,
      },
    });
  }
}

export const POST = withRateLimit(handlePOST, 'ai');
