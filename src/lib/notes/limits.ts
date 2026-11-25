// Note size limits, kept apart from the Mongo store so client components can import them.

export const MAX_TITLE = 140;
/** A note you write yourself. */
export const MAX_BODY = 4000;
/** A research report saved as a note carries its tables, so it gets more room. */
export const MAX_RESEARCH_BODY = 20000;
export const MAX_NOTES_PER_USER = 200;
export const MAX_TICKERS = 8;

export type NoteSource = 'manual' | 'research';

export const bodyLimit = (source: NoteSource): number => (source === 'research' ? MAX_RESEARCH_BODY : MAX_BODY);
