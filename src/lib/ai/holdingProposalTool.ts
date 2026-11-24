import { tool, type ToolSet } from 'ai';
import { listHoldings } from '@/lib/holdings';
import { HOLDING_PROPOSAL_TOOL, checkProposal, holdingProposalSchema, type HoldingProposalOutput } from '@/lib/mitra-chat/holdingProposal';

/**
 * `propose_holding_change` (#337, ADR 0080): shows the user a card to add, update or remove a holding. It writes nothing:
 * the user's click on the card calls the holdings API. It is exported apart from `buildChatTools` because only the workspace
 * has a card to render it; the route stops the turn after this call and the user's decision arrives as their next message.
 */
export function buildHoldingProposalTools(userId: string | null): ToolSet {
  return {
    [HOLDING_PROPOSAL_TOOL]: tool({
      description:
        'Show the user a card to add, update or remove a holding in their portfolio. You cannot save anything yourself: the user checks the numbers on the card and confirms. `add` is a stock they do not hold yet; `update` replaces the quantity and average price of one they hold (send the new totals, not the change); `remove` deletes it. Resolve the NSE symbol with `search_symbols` first. If the quantity or price is missing, look up what you can (an IPO issue price from `list_ipos`) and ask the user for the rest with `ask_user` instead of guessing. After calling this, write nothing else: the turn ends and their decision arrives as the next message.',
      inputSchema: holdingProposalSchema,
      execute: async (proposal): Promise<HoldingProposalOutput> => {
        if (!userId) return { status: 'rejected', reason: 'Not signed in.' };
        return checkProposal(proposal, await listHoldings(userId));
      },
    }),
  };
}
