// Shared by the server tools and the chat renderer, so the client never imports the tool code (#326, #329).
import type { A2uiMessage } from '@/lib/mitra-chat/a2ui/kit';

export const SHOW_PORTFOLIO_SNAPSHOT_TOOL = 'show_portfolio_snapshot';
export const SHOW_ANALYST_CARD_TOOL = 'show_analyst_card';
export const SHOW_DESK_OVERVIEW_TOOL = 'show_desk_overview';
export const SHOW_NOTES_TOOL = 'show_notes';

/** Every tool whose result the chat draws as an A2UI card. */
export const CARD_TOOLS: readonly string[] = [SHOW_PORTFOLIO_SNAPSHOT_TOOL, SHOW_ANALYST_CARD_TOOL, SHOW_DESK_OVERVIEW_TOOL, SHOW_NOTES_TOOL];

export const isCardToolPart = (partType: string): boolean => partType.startsWith('tool-') && CARD_TOOLS.includes(partType.slice('tool-'.length));

export interface CardToolOutput {
  readonly shown: boolean;
  /** A2UI v1.0 messages for the chat to render; empty when nothing was shown. */
  readonly messages: readonly A2uiMessage[];
  /** What the model reads in place of the layout. */
  readonly summary: string;
}
