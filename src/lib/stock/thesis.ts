// The "Investment thesis and entry snapshot" card on the stock page (#422): which note holds a stock's thesis, and the
// entry figures taken from the decision journal. Pure.

import type { JournalSnapshot } from '@/lib/tradeJournal/types';

export const THESIS_TITLE_PREFIX = 'Thesis: ';
export const THESIS_PLACEHOLDER = 'Why you own it, what would make you wrong, and the price or event at which you would reconsider.';

export const thesisTitle = (symbol: string): string => `${THESIS_TITLE_PREFIX}${symbol.trim().toUpperCase()}`;

interface NoteLike {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly symbol: string | null;
  readonly updatedAt: string | Date;
}

/** The user's thesis note for a stock: titled "Thesis: SYMBOL" and tagged with that symbol. The newest wins if there are several. */
export function findThesisNote<T extends NoteLike>(notes: readonly T[], symbol: string): T | null {
  const sym = symbol.trim().toUpperCase();
  const matches = notes.filter((n) => n.symbol?.toUpperCase() === sym && n.title.trim().toLowerCase() === thesisTitle(sym).toLowerCase());
  return [...matches].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}

/** The newest journal entry that opened the position: what was true on the day it was bought. */
export function entrySnapshot(entries: readonly JournalSnapshot[]): JournalSnapshot | null {
  return [...entries].filter((e) => e.event === 'buy').sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
}

/** Unrealised return on cost in percent; null without a price or a positive cost. */
export function pnlPct(avgPrice: number, ltp: number | null): number | null {
  return ltp === null || !(avgPrice > 0) ? null : ((ltp - avgPrice) / avgPrice) * 100;
}
