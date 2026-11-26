import { tool, type Tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { buildAnalystCard, buildDeskOverview, type AnalystCardInput, type CardResult, type DeskView } from '@/lib/mitra-chat/a2ui/analystCards';
import { buildNotesCard } from '@/lib/mitra-chat/a2ui/notesCard';
import { buildPortfolioSnapshot } from '@/lib/mitra-chat/a2ui/portfolioSnapshot';
import type { NoteList } from '@/lib/mitra-chat/notesList';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { SHOW_ANALYST_CARD_TOOL, SHOW_DESK_OVERVIEW_TOOL, SHOW_NOTES_TOOL, SHOW_PORTFOLIO_SNAPSHOT_TOOL, type CardToolOutput } from './a2uiToolTypes';

/**
 * One card tool (#326, #329, ADR 0077, 0078). Read-only and built from the user's own data on the server: the model decides to call
 * it, but never writes a component or a figure. The card goes to the chat in full; the model only gets the figures as text.
 */
function cardTool<S extends z.ZodObject>(description: string, load: (input: z.infer<S>) => Promise<CardResult | null>, whenEmpty: string, inputSchema?: S): Tool {
  return tool({
    description,
    inputSchema: (inputSchema ?? z.object({})) as z.ZodObject,
    execute: async (input): Promise<CardToolOutput> => {
      const card = await load(input as z.infer<S>).catch(() => null);
      return card ? { shown: true, messages: card.messages, summary: card.summary } : { shown: false, messages: [], summary: whenEmpty };
    },
    toModelOutput: ({ output }) => ({ type: 'text', value: (output as CardToolOutput).summary }),
  });
}

/** Mitra chat: the portfolio snapshot. Offered only when the user turned on "Rich replies". */
export function buildA2uiTools(loadHoldings: () => Promise<readonly HoldingLike[]>, loadNotes?: (filter: { query?: string; symbol?: string }) => Promise<NoteList>): ToolSet {
  return {
    ...(loadNotes
      ? {
          [SHOW_NOTES_TOOL]: cardTool(
            "Show the user a visual card of their own saved notes (saved research reports and notes they wrote): title, kind, tickers, date and a preview of each, with Open and Ask Mitra buttons. Use it when they ask to see or list their notes, optionally filtered by a ticker or words. It shows every match; then answer in a line or two about what the notes cover, using list_notes or get_note if you need detail. Never repeat the card line by line.",
            async (filter) => buildNotesCard(await loadNotes(filter)),
            'The user has no notes that match, so no card was shown. Say so briefly and mention they can save a research report to Notes or write one.',
            z.object({
              query: z.string().trim().max(200).optional().describe('Words to look for in titles, text and tickers.'),
              symbol: z.string().trim().max(30).optional().describe('Only notes about this NSE symbol.'),
            })
          ),
        }
      : {}),
    [SHOW_PORTFOLIO_SNAPSHOT_TOOL]: cardTool(
      "Show the user a visual card of their own portfolio: value, invested amount, unrealised P&L, today's move, the biggest holdings and risk notes, all computed from their real holdings and live prices. Use it when they ask for an overview or how their portfolio is doing. Afterwards write a short interpretation; do not repeat the card's numbers line by line.",
      async () => buildPortfolioSnapshot(await loadHoldings()),
      'The user has no holdings with data yet, so no card was shown. Say so briefly and suggest adding holdings.'
    ),
  };
}

/** Analyst Desk chat with one stock's analyst: that analyst's card. */
export function buildAnalystCardTools(loadAnalyst: () => Promise<AnalystCardInput | null>): ToolSet {
  return {
    [SHOW_ANALYST_CARD_TOOL]: cardTool(
      "Show the user a visual card of this analyst's status, dossier summary, strengths, open risks and latest journal notes, taken from what is stored. Use it when they ask for a summary or where things stand. Afterwards answer briefly in words; do not repeat the card line by line.",
      async () => {
        const input = await loadAnalyst();
        return input ? buildAnalystCard(input) : null;
      },
      'There is nothing stored for this analyst yet, so no card was shown. Say so briefly.'
    ),
  };
}

/** Analyst Desk chat with the Root Agent: the whole desk. */
export function buildDeskOverviewTools(loadDesk: () => Promise<readonly DeskView[]>): ToolSet {
  return {
    [SHOW_DESK_OVERVIEW_TOOL]: cardTool(
      'Show the user a visual overview of every analyst on their desk: status and latest note for each. Use it when they ask for an overview of the desk or which analysts have flagged something. Afterwards answer briefly in words; do not repeat the card line by line.',
      async () => buildDeskOverview(await loadDesk()),
      'The desk has no analysts yet, so no card was shown. Say so briefly.'
    ),
  };
}
