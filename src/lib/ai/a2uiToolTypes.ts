// Shared by the server tool and the chat renderer, so the client never imports the tool code (#326).
import type { A2uiMessage } from '@/lib/mitra-chat/a2ui/portfolioSnapshot';

export const SHOW_PORTFOLIO_SNAPSHOT_TOOL = 'show_portfolio_snapshot';

export interface SnapshotToolOutput {
  readonly shown: boolean;
  /** A2UI v1.0 messages for the chat to render; empty when nothing was shown. */
  readonly messages: readonly A2uiMessage[];
  /** What the model reads in place of the layout. */
  readonly summary: string;
}
