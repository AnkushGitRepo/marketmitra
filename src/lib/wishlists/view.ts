// View-level helpers for watchlists (#106). Stored lists keep their legacy `wishlists` names; the Holdings list is
// never stored: it is derived from the portfolio each time, so it cannot drift from it.

import type { Quote } from '@/lib/dashboard/quotes';

export const HOLDINGS_LIST_ID = '__holdings__';
export const HOLDINGS_LIST_NAME = 'Holdings';
export const MAX_NAME_LENGTH = 60;

export interface ViewList {
  id: string;
  name: string;
  symbols: string[];
  /** True for lists the user cannot edit by hand (Holdings). */
  managed: boolean;
}

export type SortMode = 'default' | 'gain' | 'loss';

/** Day-change ordering. Symbols without a live quote always go last; ties keep their stored order. */
export function sortSymbols(symbols: readonly string[], quotes: Record<string, Quote | undefined>, mode: SortMode): string[] {
  if (mode === 'default') return [...symbols];
  const dir = mode === 'gain' ? -1 : 1;
  return symbols
    .map((symbol, index) => ({ symbol, index, pct: quotes[symbol]?.changePct }))
    .sort((a, b) => {
      const aMissing = a.pct === undefined;
      const bMissing = b.pct === undefined;
      if (aMissing || bMissing) return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      return dir * ((a.pct as number) - (b.pct as number)) || a.index - b.index;
    })
    .map((x) => x.symbol);
}

/** The user's lists with a managed "Holdings" list in front (omitted when nothing is held). */
export function withHoldingsList(lists: readonly ViewList[], holdings: ReadonlyArray<{ symbol: string }>): ViewList[] {
  const symbols = [...new Set(holdings.map((h) => h.symbol.trim().toUpperCase()).filter(Boolean))];
  if (symbols.length === 0) return [...lists];
  return [{ id: HOLDINGS_LIST_ID, name: HOLDINGS_LIST_NAME, symbols, managed: true }, ...lists];
}

export function isReservedName(name: string): boolean {
  return name.trim().toLowerCase() === HOLDINGS_LIST_NAME.toLowerCase();
}

/** A reader-facing error for a bad name, or null. `exceptId` is the list being renamed. */
export function validateWatchlistName(name: string, existing: ReadonlyArray<{ id: string; name: string }>, exceptId?: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name for the watchlist.';
  if (trimmed.length > MAX_NAME_LENGTH) return `Keep the name to ${MAX_NAME_LENGTH} characters or fewer.`;
  if (isReservedName(trimmed)) return 'Holdings is reserved for the list that follows your portfolio. Pick another name.';
  const lower = trimmed.toLowerCase();
  if (existing.some((w) => w.id !== exceptId && w.name.trim().toLowerCase() === lower)) return 'You already have a watchlist with that name.';
  return null;
}
