import { tool, type ToolSet } from 'ai';
import { ASK_USER_TOOL, askUserInputSchema } from '@/lib/mitra-chat/askUser';

/**
 * `ask_user` (#322): a clarifying question shown as a card in the Mitra workspace. It changes nothing, so it is not a
 * write tool. It is exported apart from `buildChatTools` because only the workspace has a card to render it; the
 * route stops the turn after this call and the user's answer arrives as their next message.
 */
export function buildAskUserTools(): ToolSet {
  return {
    [ASK_USER_TOOL]: tool({
      description:
        'Ask the user ONE short clarifying question when the answer depends on something only they know (time horizon, risk appetite, which holding, how much) and a wrong guess would make your reply unhelpful. Give 2 to 6 short options; the user can also type their own answer. Do not use it for anything a tool, the portfolio context or the conversation already answers, and never twice in a row. After calling it, write nothing else: the turn ends and the answer comes back as the next message.',
      inputSchema: askUserInputSchema,
      execute: async () => ({ status: 'waiting_for_user' }),
    }),
  };
}
