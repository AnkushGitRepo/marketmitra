import { NextResponse } from 'next/server';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateId, type UIMessage } from 'ai';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { streamChat } from '@/lib/ai/generate';
import { MITRA_WORKSPACE_SYSTEM } from '@/lib/ai/prompts';
import { buildChatTools } from '@/lib/ai/chatTools';
import { buildPortfolioContext } from '@/lib/ai/portfolioContext';
import { prepareAdvisorChat } from '@/lib/advisor/behaviour/chat';
import { logEvent } from '@/lib/system/eventLog';
import { supportsKind, unsupportedReason } from '@/lib/mitra-chat/attachments';
import { appendMessages, getConversation, loadMessages, saveSummary } from '@/lib/mitra-chat/conversations';
import { getFileStore } from '@/lib/mitra-chat/gridFsFileStore';
import { sanitizeUserMessage } from '@/lib/mitra-chat/messageInput';
import { prepareModelMessages } from '@/lib/mitra-chat/prepareMessages';
import { summariseSlice } from '@/lib/mitra-chat/summarize';
import { planWindow } from '@/lib/mitra-chat/window';

export const dynamic = 'force-dynamic';
// A tool-calling turn plus an occasional summarisation can take several round-trips.
export const maxDuration = 120;

const MAX_TOOL_STEPS = 9;
const MAX_OUTPUT_TOKENS = 4096;

type Ctx = { params: Promise<{ id: string }> };

const err = (error: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, data: null, error, ...extra }, { status });

/** A fixed assistant reply, streamed in the same shape as a model reply. */
function textReply(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: 'text-start', id: 'fixed-reply' });
      writer.write({ type: 'text-delta', id: 'fixed-reply', delta: text });
      writer.write({ type: 'text-end', id: 'fixed-reply' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

const textOf = (m: UIMessage): string =>
  m.parts
    .filter((p): p is Extract<UIMessage['parts'][number], { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();

async function handleMessage(request: Request, ctx?: unknown) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await (ctx as Ctx).params;

  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  if (!body) return err('Invalid request', 422);

  const conversation = await getConversation(userId, id);
  if (!conversation) return err('Conversation not found', 404);

  // The caller's own key (or the self-host env key) — never the operator's (ADR 0018 §2).
  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) return err('no_ai_key', 400, { hint: 'Add your AI provider key in Settings.' });

  const store = getFileStore();
  const incoming = await sanitizeUserMessage(body.message, { userId, conversationId: id, store });
  if (!incoming.ok) return err(incoming.error, incoming.status);

  const reason = unsupportedReason(aiConfig, incoming.kinds);
  if (reason) return err('attachment_unsupported', 422, { hint: reason });

  const history = await loadMessages(userId, id);
  if (!(await appendMessages(userId, id, [incoming.message]))) {
    return err('This conversation is full. Start a new chat.', 409);
  }
  await store.markAttached(userId, incoming.fileIds);
  const all = [...history, incoming.message];

  const userText = textOf(incoming.message);
  const advisor = await prepareAdvisorChat(userId, userText, new Date()).catch(() => null);
  if (advisor?.blockedReply) {
    await appendMessages(userId, id, [{ id: generateId(), role: 'assistant', parts: [{ type: 'text', text: advisor.blockedReply }] }]);
    return textReply(advisor.blockedReply);
  }

  // Context window: newest messages verbatim, older ones folded into a stored summary.
  // If summarising fails, keep the gap verbatim rather than silently forgetting it.
  const plan = planWindow(all, conversation.summarizedThrough);
  let summary = conversation.summary;
  let keepFrom = plan.keepFrom;
  const { from, to } = plan.unsummarized;
  if (to > from) {
    const folded = await summariseSlice(aiConfig, summary, all.slice(from, to));
    if (folded === null) {
      keepFrom = from;
    } else {
      summary = folded;
      await saveSummary(userId, id, folded, to);
    }
  }

  const prepared = await prepareModelMessages(all.slice(keepFrom), {
    store,
    userId,
    canRead: (kind) => supportsKind(aiConfig, kind),
  });
  const modelMessages = await convertToModelMessages(prepared);

  const context = await buildPortfolioContext(userId).catch(() => '');
  const system = [
    MITRA_WORKSPACE_SYSTEM,
    `--- PORTFOLIO CONTEXT ---\n${context}`,
    summary ? `--- EARLIER IN THIS CONVERSATION (summary) ---\n${summary}` : '',
    advisor ? advisor.systemAddendum : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const tools = advisor
    ? advisor.advisorToolsOnly
      ? advisor.tools
      : { ...buildChatTools(userId), ...advisor.tools }
    : buildChatTools(userId);

  try {
    const result = streamChat(aiConfig, system, modelMessages, {
      tools,
      maxSteps: MAX_TOOL_STEPS,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });
    // Run to completion (and persist) even if the client disconnects mid-stream.
    void result.consumeStream();
    return result.toUIMessageStreamResponse({
      originalMessages: all,
      onEnd: async ({ responseMessage }) => {
        if (!textOf(responseMessage)) return;
        await appendMessages(userId, id, [responseMessage]).catch(() => false);
      },
      onError: (error) => {
        const detail = error instanceof Error ? error.message : String(error);
        void logEvent({ level: 'error', source: 'api:mitra/messages', message: `Mitra chat stream failed: ${detail.slice(0, 400)}` });
        return 'The AI provider returned an error. Check your key and model in Settings, then try again.';
      },
    });
  } catch {
    return err('The AI request failed. Please try again.', 502);
  }
}

async function handlePOST(request: Request, ctx?: unknown) {
  try {
    return await handleMessage(request, ctx);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    void logEvent({ level: 'error', source: 'api:mitra/messages', message: `Mitra chat request failed: ${detail.slice(0, 400)}` });
    // Detail is only echoed outside production; users get a generic message.
    return err('Mitra could not process that message. Please try again.', 500, process.env.NODE_ENV === 'production' ? {} : { detail });
  }
}

export const POST = withRateLimit(handlePOST, 'ai');
