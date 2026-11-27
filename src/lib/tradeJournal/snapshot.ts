// Pure helpers for the trade journal (#412): classify a holding change and build the snapshot fields from data the
// caller already fetched. Nothing here reads the network, the database or the clock.

import type { HoldingState, JournalEvent, ThesisSnapshot } from './types';

export const MAX_REASON = 280;
export const MAX_POST_MORTEM = 2000;
export const MAX_THESIS_BODY = 2000;

/** What a change to a holding amounts to. `null` before means a new holding; `null` after means it was removed. */
export function classifyEvent(before: HoldingState | null, after: HoldingState | null): JournalEvent {
  if (before === null) return 'buy';
  if (after === null) return 'exit';
  if (after.quantity > before.quantity) return 'add_more';
  if (after.quantity < before.quantity) return 'trim';
  return 'edit';
}

/** A ratio value from the data service ("23.4", "1,204.5" or null) as a number, or null when it is not one. */
export function parseRatio(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value.replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

export function ratioNamed(ratios: ReadonlyArray<{ name: string; value: string | null }>, names: readonly string[]): number | null {
  for (const name of names) {
    const hit = ratios.find((r) => r.name.trim().toLowerCase() === name.toLowerCase());
    const n = hit ? parseRatio(hit.value) : null;
    if (n !== null) return n;
  }
  return null;
}

/** The note that best explains why the user holds a symbol: the newest one that names it. */
export function pickThesisNote<T extends { id: string; title: string; body: string; symbol: string | null; tickers: readonly string[]; updatedAt: Date }>(
  notes: readonly T[],
  symbol: string
): ThesisSnapshot | null {
  const sym = symbol.toUpperCase();
  const match = notes
    .filter((n) => n.symbol?.toUpperCase() === sym || n.tickers.some((t) => t.toUpperCase() === sym))
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];
  return match ? { noteId: match.id, title: match.title, body: match.body.slice(0, MAX_THESIS_BODY) } : null;
}

/** Return of an entry's price to a later price, in percent; null when either is missing or the entry is not positive. */
export function returnPct(from: number | null, to: number | null): number | null {
  if (from === null || to === null || !(from > 0)) return null;
  return ((to - from) / from) * 100;
}

export function cleanText(value: string | null | undefined, max: number): string | null {
  const t = value?.trim();
  return t ? t.slice(0, max) : null;
}
