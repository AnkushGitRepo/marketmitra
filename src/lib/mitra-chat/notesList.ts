// The user's notes as Mitra sees them (#400): a short summary per note for listing, and a long note cut into readable parts. Pure.

import { filterNotes, noteTickers, notePreview, type VaultNote } from '@/lib/notes/vault';

export interface NoteSummary {
  readonly id: string;
  readonly title: string;
  readonly kind: 'Saved research' | 'Note';
  readonly tickers: readonly string[];
  /** yyyy-mm-dd of the last change. */
  readonly updated: string;
  readonly preview: string;
  readonly chars: number;
}

export interface NoteList {
  /** Every note the user has. */
  readonly total: number;
  /** How many match the filter, before the limit. */
  readonly matched: number;
  /** Newest first, at most `limit`. */
  readonly notes: readonly NoteSummary[];
}

export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 100;

type Listed = VaultNote & { readonly createdAt?: Date };

const isoDay = (when: Date | string): string => new Date(when).toISOString().slice(0, 10);

export function summariseNote(n: VaultNote): NoteSummary {
  return {
    id: n.id,
    title: n.title,
    kind: n.source === 'research' ? 'Saved research' : 'Note',
    tickers: noteTickers(n),
    updated: isoDay(n.updatedAt),
    preview: notePreview(n.body),
    chars: n.body.length,
  };
}

/** The notes that match (free text in the title, body or tickers; a ticker), newest first, with the true total so a short list is never mistaken for all of them. */
export function listNoteSummaries(notes: readonly Listed[], opts: { query?: string; symbol?: string; limit?: number } = {}): NoteList {
  const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? DEFAULT_LIST_LIMIT)), MAX_LIST_LIMIT);
  const symbol = opts.symbol?.trim().toUpperCase();
  const byText = filterNotes(notes, 'all', opts.query ?? '');
  const matched = symbol ? byText.filter((n) => noteTickers(n).includes(symbol)) : byText;
  const sorted = [...matched].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { total: notes.length, matched: matched.length, notes: sorted.slice(0, limit).map(summariseNote) };
}

export const NOTE_PART_CHARS = 12_000;

/** A body cut into parts of about `size` characters, each ending at a line break so a table row or a list item is not split. */
export function noteParts(body: string, size = NOTE_PART_CHARS): string[] {
  const parts: string[] = [];
  let rest = body.trim();
  while (rest.length > size) {
    const cut = rest.lastIndexOf('\n', size);
    const at = cut > size / 2 ? cut : size;
    parts.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest) parts.push(rest);
  return parts.length > 0 ? parts : [''];
}
