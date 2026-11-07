import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  type UIMessage,
} from 'ai';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { streamChat } from '@/lib/ai/generate';
import { CHAT_SYSTEM_AGENTIC } from '@/lib/ai/prompts';
import { buildChatTools } from '@/lib/ai/chatTools';
import { formatChatContext, formatPageContext, mergeNews } from '@/lib/ai/chatContext';
import { appendTurn, clearHistory, recentUserQuestions } from '@/lib/chat/chatHistory';
import { syncRecentChat } from '@/lib/rag/userSync';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getNews } from '@/lib/dashboard/newsApi';
import { logEvent } from '@/lib/system/eventLog';
import { prepareAdvisorChat } from '@/lib/advisor/behaviour/chat';
import type { PageContextValue } from '@/lib/dashboard/pageContextTypes';

export const dynamic = 'force-dynamic';
// A tool-calling turn can take several round-trips (retrieval embed +
// fundamentals-api calls); give it more room than a plain completion.
export const maxDuration = 120;
// Room for a screening conversation: a few tuning `run_screener` calls, the
// final `open_screener`, then the written answer (ADR 0034).
const MAX_TOOL_STEPS = 9;

const MAX_TURNS = 12;

// ADR 0022: the request body carries AI SDK `UIMessage[]` (from `useChat`)
// plus an optional `pageContext` describing where the user currently is.
// Message *shape* is validated separately via `safeValidateUIMessages` —
// this schema only bounds the array length and the page-context payload.
const pageContextSchema: z.ZodType<PageContextValue> = z.object({
  page: z.enum(['dashboard', 'portfolio', 'markets', 'stock']),
  ticker: z.string().trim().min(1).max(20).optional(),
  range: z.string().trim().min(1).max(10).optional(),
});

const bodySchema = z.object({
  messages: z.array(z.unknown()).min(1).max(MAX_TURNS),
  pageContext: pageContextSchema.nullable().optional(),
});

/** Joins a UI message's text parts — used to persist the plain-text turn
 * (chat history / retrieval corpus) regardless of the richer part shape. */
function textFromParts(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<UIMessage['parts'][number], { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
}

function lastUserText(messages: UIMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return last ? textFromParts(last) : '';
}

// A small always-present seed: the portfolio summary + a few headlines.
// The model reaches for `search_context` / the data tools for anything
// beyond this.
async function buildContext(userId: string): Promise<string> {
  const holdings = await getEnrichedHoldings(userId).catch(() => []);
  const symbols = holdings.map((h) => h.symbol);
  const [specific, broad] = await Promise.all([
    symbols.length
      ? getNews({ symbols, limit: 6 })
      : Promise.resolve({ items: [], next_cursor: null }),
    getNews({ limit: 4 }),
  ]);
  return formatChatContext(holdings, mergeNews(specific.items, broad.items));
}

/** A fixed assistant reply, streamed in the same shape as a model reply. */
function textReply(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'text-start', id: 'advisor-reply' });
      writer.write({ type: 'text-delta', id: 'advisor-reply', delta: text });
      writer.write({ type: 'text-end', id: 'advisor-reply' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 422 });

  const validated = await safeValidateUIMessages({ messages: parsed.data.messages });
  if (!validated.success) return NextResponse.json({ error: 'Invalid request' }, { status: 422 });
  const uiMessages = validated.data;

  // Mitra is a per-user surface — the caller's own key (or, in self-host,
  // the deployment env key). Never the hosted operator's key (ADR 0018 §2).
  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json(
      { error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 }
    );
  }

  const context = await buildContext(userId);
  const pageContextLine = formatPageContext(parsed.data.pageContext ?? null);
  const lastUserMessage = lastUserText(uiMessages);

  // Mitra Advisor (local-only, ADR 0035): null unless the flag is on and a
  // policy exists, in which case chat is exactly what it was before.
  const advisor = await prepareAdvisorChat(userId, lastUserMessage, new Date()).catch(() => null);
  if (advisor?.blockedReply) return textReply(advisor.blockedReply);

  const system = `${CHAT_SYSTEM_AGENTIC}\n\n--- PORTFOLIO CONTEXT ---\n${context}\n\n--- CURRENT PAGE ---\n${pageContextLine}${advisor ? `\n\n${advisor.systemAddendum}` : ''}`;
  const tools = advisor
    ? advisor.advisorToolsOnly
      ? advisor.tools
      : { ...buildChatTools(userId), ...advisor.tools }
    : buildChatTools(userId);
  const modelMessages = await convertToModelMessages(uiMessages);

  try {
    const result = streamChat(aiConfig, system, modelMessages, {
      tools,
      maxSteps: MAX_TOOL_STEPS,
      onFinish: async ({ text }) => {
        if (!text.trim() || !lastUserMessage) return;
        await appendTurn(userId, lastUserMessage, text);
        void syncRecentChat(userId, await recentUserQuestions(userId));
      },
    });
    return result.toUIMessageStreamResponse({
      // Without this the client only ever sees "An error occurred." and the
      // cause (bad key, provider rejecting a tool schema, quota) is lost.
      // Log it for the operator; show the user something actionable.
      onError: (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        void logEvent({ level: 'error', source: 'api:ai/chat', message: `Chat stream failed: ${detail.slice(0, 400)}` });
        return 'The AI provider returned an error. Check your key and model in Settings, then try again.';
      },
    });
  } catch {
    return NextResponse.json({ error: 'The AI request failed. Please try again.' }, { status: 502 });
  }
}

async function handleDELETE() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const removed = await clearHistory(userId);
  void syncRecentChat(userId, []);
  return NextResponse.json({ success: true, data: { removed } });
}

export const POST = withRateLimit(handlePOST, 'ai');
export const DELETE = handleDELETE;
