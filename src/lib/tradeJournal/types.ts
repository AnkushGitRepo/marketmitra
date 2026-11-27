// Decision & trade journal (#412): an immutable snapshot of what the user knew when a holding changed.

export type JournalEvent = 'buy' | 'add_more' | 'trim' | 'edit' | 'exit';

export interface HoldingState {
  readonly quantity: number;
  readonly avgPrice: number;
}

export interface ThesisSnapshot {
  readonly noteId: string;
  readonly title: string;
  /** The note body as it read at that moment, capped; later edits to the note do not rewrite it. */
  readonly body: string;
}

export interface JournalSnapshot {
  readonly id: string;
  readonly symbol: string;
  readonly event: JournalEvent;
  readonly at: string;
  readonly before: HoldingState | null;
  readonly after: HoldingState | null;
  /** Live price when the change was saved; null when no quote was available. */
  readonly marketPrice: number | null;
  readonly pe: number | null;
  readonly roce: number | null;
  readonly thesis: ThesisSnapshot | null;
  /** The user's own one-line reason, if they gave one. */
  readonly reason: string | null;
  /** Guardrail alert types that were active on the symbol at that moment. */
  readonly guardrails: readonly string[];
  /** Reflection written later, usually on an exit. The only field that can change after the snapshot is saved. */
  readonly postMortem: string | null;
}
