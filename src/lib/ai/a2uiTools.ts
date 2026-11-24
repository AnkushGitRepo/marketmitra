import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { buildPortfolioSnapshot } from '@/lib/mitra-chat/a2ui/portfolioSnapshot';
import { SHOW_PORTFOLIO_SNAPSHOT_TOOL, type SnapshotToolOutput } from './a2uiToolTypes';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';

/**
 * Tools that answer with an A2UI surface (#326, ADR 0077). Read-only and built from the user's own data on the server:
 * the model decides to call one, but never writes a component or a figure. Offered only when the user turned on
 * "Rich replies" in Settings, and only in the Mitra workspace (the one place with a renderer).
 */
export function buildA2uiTools(loadHoldings: () => Promise<readonly HoldingLike[]>): ToolSet {
  return {
    [SHOW_PORTFOLIO_SNAPSHOT_TOOL]: tool({
      description:
        "Show the user a visual card of their own portfolio: value, invested amount, unrealised P&L, today's move, the biggest holdings and risk notes, all computed from their real holdings and live prices. Use it when they ask for an overview or how their portfolio is doing. Afterwards write a short interpretation; do not repeat the card's numbers line by line.",
      inputSchema: z.object({}),
      execute: async (): Promise<SnapshotToolOutput> => {
        const holdings = await loadHoldings().catch(() => []);
        const snapshot = buildPortfolioSnapshot(holdings);
        return snapshot
          ? { shown: true, messages: snapshot.messages, summary: snapshot.summary }
          : { shown: false, messages: [], summary: 'The user has no holdings with data yet, so no card was shown. Say so briefly and suggest adding holdings.' };
      },
      // The card goes to the chat in full; the model only gets the figures as text, not the layout.
      toModelOutput: ({ output }) => ({ type: 'text', value: (output as SnapshotToolOutput).summary }),
    }),
  };
}
