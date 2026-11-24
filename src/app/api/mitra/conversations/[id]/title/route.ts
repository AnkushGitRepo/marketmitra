import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { logEvent } from '@/lib/system/eventLog';
import { getConversation, loadMessages, setGeneratedTitle } from '@/lib/mitra-chat/conversations';
import { generateChatTitle, hasAnswerText } from '@/lib/mitra-chat/generateTitle';
import { TITLE_GENERATION_MAX_MESSAGES } from '@/lib/mitra-chat/limits';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/**
 * Writes a short title for the chat from its first question and answer, with the caller's own AI key (#341). It does nothing when the
 * title is not the automatic one (the user renamed it, or it was already generated), when there is no answer yet, when the chat is already long, or when the model
 * call fails: the conversation is returned as it stands and the current title stays.
 */
async function handlePOST(_request: Request, ctx?: unknown) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  const { id } = await (ctx as Ctx).params;
  const conversation = await getConversation(userId, id);
  if (!conversation) return err('Conversation not found', 404);
  if (conversation.titleSource !== 'auto') return NextResponse.json({ success: true, data: conversation, error: null });

  const messages = await loadMessages(userId, id);
  const config = await getUserAiConfig(userId);
  if (!config || messages.length > TITLE_GENERATION_MAX_MESSAGES || !hasAnswerText(messages)) return NextResponse.json({ success: true, data: conversation, error: null });

  const title = await generateChatTitle(config, messages);
  const updated = title ? await setGeneratedTitle(userId, id, title) : conversation;
  return NextResponse.json({ success: true, data: updated ?? conversation, error: null });
}

async function guardedPOST(request: Request, ctx?: unknown) {
  try {
    return await handlePOST(request, ctx);
  } catch (error) {
    // A title is a nicety: log it (type only, no chat text) and let the client keep the current one.
    const detail = error instanceof Error ? error.name : 'Error';
    void logEvent({ level: 'error', source: 'api:mitra/title', message: `Mitra chat title failed: ${detail}` });
    return err('Could not generate a title.', 500);
  }
}

export const POST = withRateLimit(guardedPOST, 'ai');
