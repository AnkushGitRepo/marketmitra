// View helpers for the journal panel (#412). Pure: "now" prices are passed in.

import { returnPct } from './snapshot';
import type { JournalEvent, JournalSnapshot } from './types';

export const EVENT_LABEL: Record<JournalEvent, string> = {
  buy: 'Bought',
  add_more: 'Added to',
  trim: 'Trimmed',
  edit: 'Edited',
  exit: 'Exited',
};

export interface SymbolJournal {
  readonly symbol: string;
  /** Newest first, as stored. */
  readonly entries: readonly JournalSnapshot[];
  readonly held: boolean;
}

/** Entries grouped by symbol; groups ordered by their newest entry. Does not change its input. */
export function groupBySymbol(entries: readonly JournalSnapshot[], heldSymbols: ReadonlySet<string>): SymbolJournal[] {
  const groups = new Map<string, JournalSnapshot[]>();
  for (const e of [...entries].sort((a, b) => b.at.localeCompare(a.at))) {
    groups.set(e.symbol, [...(groups.get(e.symbol) ?? []), e]);
  }
  return [...groups].map(([symbol, list]) => ({ symbol, entries: list, held: heldSymbols.has(symbol) }));
}

export interface Outcome {
  readonly label: string;
  /** Percent; null when a price needed for it was not recorded. */
  readonly pct: number | null;
}

/**
 * What happened since an entry. A buy or add is measured from the price the user saw then to the price now (when still
 * held). An exit is measured from the user's average cost to the live price at the time they removed it, which is not
 * a recorded sale price. Anything else has no outcome.
 */
export function outcomeFor(entry: JournalSnapshot, nowPrice: number | null): Outcome | null {
  if (entry.event === 'exit') {
    return { label: 'Exit vs your average cost', pct: returnPct(entry.before?.avgPrice ?? null, entry.marketPrice) };
  }
  if (entry.event === 'buy' || entry.event === 'add_more') {
    return { label: 'Now vs price then', pct: returnPct(entry.marketPrice, nowPrice) };
  }
  return null;
}
