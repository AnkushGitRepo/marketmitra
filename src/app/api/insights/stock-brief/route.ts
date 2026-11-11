import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateInsightText } from '@/lib/ai/generate';
import { promptForMode } from '@/lib/ai/promptMode';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';
import { STOCK_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { gatherStockInput } from '@/lib/ai/stockInput';
import { buildBriefPrompt, parseBrief, sanitizeBrief, type BriefFacts } from '@/lib/ai/stockBrief';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getPeers, getPrices, getQuotes } from '@/lib/dashboard/fundamentalsApi';
import { toBars } from '@/lib/chart/bars';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { withRateLimit } from '@/lib/rateLimit';
import { buildKeyTiles, medianPeerPe } from '@/lib/stock/keyRatios';
import { rangePosition, resolveRange52 } from '@/lib/stock/range52';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 24 * 60 * 60 * 1000;
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
  const [input, peers, prices, quotes] = await Promise.all([
    gatherStockInput(symbol, userId),
    getPeers(symbol),
    getPrices(symbol, '5y'),
    getQuotes([symbol]).catch(() => []),
  ]);
  if (!input) return NextResponse.json({ success: false, error: 'Could not load data for that symbol.' }, { status: 502 });

  const quote = quotes[0] ?? null;
  const price = quote?.price != null ? Number(quote.price) : input.latestClose;
  const range = resolveRange52({ low: quote?.week52_low ?? null, high: quote?.week52_high ?? null }, toBars(prices ?? []));
  const tiles = buildKeyTiles({ ratios: input.ratios.map((r) => ({ ...r, as_of: '', source_tier: '' })), peers: peers ?? [], price });
  const tileNumber = (label: string) => {
    const v = Number(tiles.find((t) => t.label === label)?.value.replace(/x$/, ''));
    return Number.isFinite(v) ? v : null;
  };
  const facts: BriefFacts = {
    pe: tileNumber('P/E'),
    pb: tileNumber('P/B'),
    peerMedianPe: medianPeerPe(peers ?? []),
    rangePct: rangePosition(price, range)?.pct ?? null,
    range,
  };

  const result = await getOrGenerate({
    scope: 'stock_brief',
    key: symbol,
    userId,
    // The mode is part of the cache key, so switching it never serves a stale verdict (or a stale refusal).
    inputHash: hashInput({ input, facts, mode }),
    ttlMs: TTL_MS,
    force: parsed.data.force,
    generate: async () => {
      const gen = await generateInsightText(aiConfig, promptForMode(STOCK_BRIEF_SYSTEM, mode), buildBriefPrompt(input, facts));
      if (!gen.ok) return { error: gen.error };
      const brief = parseBrief(gen.text);
      if (!brief) return { error: 'Mitra returned an answer the page could not read. Try again.' };
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
