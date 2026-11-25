// Pure helpers for the notes page: which filter a note belongs to, search, and a short preview.

import type { NoteSource } from './limits';

export type NoteCategory = 'research' | 'stock' | 'general';
export type NoteFilter = 'all' | NoteCategory;

export const NOTE_FILTERS: readonly { readonly id: NoteFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'research', label: 'Saved research' },
  { id: 'stock', label: 'Stock notes' },
  { id: 'general', label: 'Sector & general' },
];

export interface VaultNote {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly symbol: string | null;
  readonly tickers: readonly string[];
  readonly source: NoteSource;
  readonly updatedAt: Date | string;
}

/** Research saved from the Research page is its own group; a note of your own is about a stock (it names a symbol) or is general. */
export function noteCategory(note: Pick<VaultNote, 'source' | 'symbol'>): NoteCategory {
  if (note.source === 'research') return 'research';
  return note.symbol ? 'stock' : 'general';
}

/** Every ticker a note is about, without repeats: its symbol first, then the others. */
export function noteTickers(note: Pick<VaultNote, 'symbol' | 'tickers'>): string[] {
  return [...new Set([...(note.symbol ? [note.symbol] : []), ...note.tickers])];
}

export function filterNotes<T extends VaultNote>(notes: readonly T[], filter: NoteFilter, query: string): T[] {
  const q = query.trim().toLowerCase();
  return notes.filter((n) => {
    if (filter !== 'all' && noteCategory(n) !== filter) return false;
    if (!q) return true;
    return n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || noteTickers(n).some((t) => t.toLowerCase().includes(q));
  });
}

export function filterCounts(notes: readonly VaultNote[]): Record<NoteFilter, number> {
  const counts: Record<NoteFilter, number> = { all: notes.length, research: 0, stock: 0, general: 0 };
  for (const n of notes) counts[noteCategory(n)] += 1;
  return counts;
}

const PREVIEW_CHARS = 110;

const stripMarks = (line: string): string => line.replace(/^[>\-*\s]+/, '').replace(/[*_`]/g, '').trim();

/** The first line of prose in a note, without markdown marks, for the list. Headings and table rows only when there is nothing else. */
export function notePreview(body: string): string {
  const lines = body.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const prose = lines.find((l) => !l.startsWith('#') && !l.startsWith('|'));
  const line = stripMarks(prose ?? lines.find((l) => l.startsWith('#'))?.replace(/^#+\s*/, '') ?? '');
  if (!line) return '';
  return line.length <= PREVIEW_CHARS ? line : `${line.slice(0, PREVIEW_CHARS - 1).trimEnd()}…`;
}

/** The prompt that opens Mitra on a note; Mitra finds the note's text itself through retrieval. */
export function askMitraHref(title: string): string {
  return `/mitra?q=${encodeURIComponent(`Using my note "${title}", summarise the key points and what I should check next.`)}`;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const RELATIVE_DAYS = 7;

/** "just now", "5 mins ago", "3 hours ago", "2 days ago", then a date from a week on. The clock is passed in. */
export function timeAgo(when: Date | string, now: Date): string {
  const then = new Date(when);
  const age = now.getTime() - then.getTime();
  if (age < MINUTE_MS) return 'just now';
  if (age < HOUR_MS) return plural(Math.floor(age / MINUTE_MS), 'min');
  if (age < DAY_MS) return plural(Math.floor(age / HOUR_MS), 'hour');
  if (age < RELATIVE_DAYS * DAY_MS) return plural(Math.floor(age / DAY_MS), 'day');
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
