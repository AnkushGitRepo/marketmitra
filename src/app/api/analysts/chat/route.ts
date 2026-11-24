import { NextResponse } from 'next/server';
import { z } from 'zod';
import { convertToModelMessages, safeValidateUIMessages } from 'ai';
import { streamChat } from '@/lib/ai/generate';
import { ANALYST_CARDS_PROMPT, ANALYST_CHAT_SYSTEM, ROOT_CHAT_SYSTEM } from '@/lib/ai/prompts';
import { buildAnalystCardTools, buildDeskOverviewTools } from '@/lib/ai/a2uiTools';
import type { DeskView } from '@/lib/mitra-chat/a2ui/analystCards';
import { getPreferences } from '@/lib/preferences/store';
import { buildPortfolioContext } from '@/lib/ai/portfolioContext';
import { promptForMode } from '@/lib/ai/promptMode';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';
import { buildBriefPrompt } from '@/lib/ai/stockBrief';
import { loadSignalBundle } from '@/lib/ai/stockSignalsServer';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { analystChatContext, rootChatContext } from '@/lib/analysts/chatContext';
import { getAnalyst, latestEntries, listAnalysts, listJournal } from '@/lib/analysts/store';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';
import { logEvent } from '@/lib/system/eventLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_TURNS = 12;
// Thinking models spend part of the output budget reasoning, so the 2048 default cuts answers off (see #117). Only tokens used are billed.
const MAX_OUTPUT_TOKENS = 12000;
// Analysts answer from a fixed context, so a chat turn is one model call. The one exception is a single read-only card tool, offered only when the
// user turned on "Rich replies" (#329); the turn then ends after the card and a short written answer (at most 2 steps).
const CARD_STEPS = 2;
const bodySchema = z.object({
  /** Omitted: the Root Agent. Set: that stock's analyst. */
  symbol: z.string().trim().min(1).max(20).optional(),
  messages: z.array(z.unknown()).min(1).max(MAX_TURNS),
});

/** The system prompt for this chat, or null when the symbol has no analyst. */
async function buildSystem(userId: string, symbol: string | undefined, mode: Awaited<ReturnType<typeof resolvePromptMode>>): Promise<string | null> {
  if (symbol) {
    const analyst = await getAnalyst(userId, symbol);
    if (!analyst) return null;
    const [journal, bundle] = await Promise.all([listJournal(userId, analyst.symbol, 10), loadSignalBundle(analyst.symbol).catch(() => null)]);
    const facts = bundle ? buildBriefPrompt(bundle.context, bundle.signals) : null;
    return `${promptForMode(ANALYST_CHAT_SYSTEM, mode)}\n\n--- ANALYST CONTEXT ---\n${analystChatContext({ symbol: analyst.symbol, dossier: analyst.dossier, journal, facts })}`;
  }
  const analysts = await listAnalysts(userId);
  const [latest, portfolio] = await Promise.all([latestEntries(userId, analysts.map((a) => a.symbol)), buildPortfolioContext(userId).catch(() => 'Portfolio summary not available right now.')]);
  const views = analysts.map((a) => ({
    symbol: a.symbol,
    status: a.status,
    summary: a.dossier?.summary ?? null,
    vulnerabilityTitles: a.dossier?.vulnerabilities.map((v) => v.title) ?? [],
    latest: latest[a.symbol] ?? null,
  }));
  return `${promptForMode(ROOT_CHAT_SYSTEM, mode)}\n\n--- DESK CONTEXT ---\n${rootChatContext(views, portfolio)}`;
}

/** The card tool for this chat (one stock's analyst, or the whole desk), with loaders that read what is stored. */
async function cardTools(userId: string, symbol: string | undefined) {
  if (symbol) {
    return {
      name: 'show_analyst_card' as const,
      tools: buildAnalystCardTools(async () => {
        const analyst = await getAnalyst(userId, symbol);
        if (!analyst) return null;
        const journal = await listJournal(userId, analyst.symbol, 5);
        return { symbol: analyst.symbol, status: analyst.status, statusNote: analyst.statusNote, dossier: analyst.dossier, journal };
      }),
    };
  }
  return {
    name: 'show_desk_overview' as const,
    tools: buildDeskOverviewTools(async (): Promise<DeskView[]> => {
      const analysts = await listAnalysts(userId);
      const latest = await latestEntries(userId, analysts.map((a) => a.symbol));
      return analysts.map((a) => ({ symbol: a.symbol, status: a.status, summary: a.dossier?.summary ?? null, latest: latest[a.symbol] ?? null }));
    }),
  };
}

async function handlePOST(request: Request) {
  // Session only: this spends the user's own AI key, like the other analyst endpoints.
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validated.success) return NextResponse.json({ error: 'Invalid request' }, { status: 422 });

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) return NextResponse.json({ error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' }, { status: 400 });

  // Guarded unless a local user or a hosted admin opted in (ADR 0054, 0070).
  const mode = await resolvePromptMode(userId);
  let system: string | null;
  try {
    system = await buildSystem(userId, parsed.data.symbol, mode);
  } catch {
    return NextResponse.json({ error: 'Could not load the analyst. Try again.' }, { status: 500 });
  }
  if (system === null) return NextResponse.json({ error: 'No analyst for this stock' }, { status: 404 });

  const prefs = await getPreferences(userId);
  const cards = prefs.chat.richReplies ? await cardTools(userId, parsed.data.symbol) : null;
  const finalSystem = cards ? `${system}\n\n${ANALYST_CARDS_PROMPT(cards.name)}` : system;

  try {
    const result = streamChat(aiConfig, finalSystem, await convertToModelMessages(validated.data, cards ? { tools: cards.tools } : undefined), {
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      ...(cards ? { tools: cards.tools, maxSteps: CARD_STEPS } : {}),
    });
    return result.toUIMessageStreamResponse({
      onError: (error) => {
        // Only the error type goes to the log: provider messages can echo parts of the prompt.
        void logEvent({ level: 'error', source: 'api:analysts/chat', message: `Analyst chat stream failed: ${error instanceof Error ? error.name : 'Error'}` });
        return 'The AI provider returned an error. Check your key and model in Settings, then try again.';
      },
    });
  } catch {
    return NextResponse.json({ error: 'The AI request failed. Please try again.' }, { status: 502 });
  }
}

export const POST = withRateLimit(handlePOST, 'ai');
