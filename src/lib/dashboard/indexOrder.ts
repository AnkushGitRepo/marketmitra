import type { IndexQuoteOut } from './fundamentalsApi';

/** The four indices the dashboard row is built for, in display order. */
export const PREFERRED_INDEX_ORDER = ['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'INDIA VIX'] as const;

const normalise = (name: string) => name.trim().toUpperCase().replace(/\s+/g, ' ');

/**
 * Orders indices for the 4-up row: the preferred four first in their fixed order, then any others in their
 * original order. Returns at most `limit` so the row stays a single, balanced line. Never mutates its input.
 */
export function orderIndices(indices: readonly IndexQuoteOut[], limit = 4): IndexQuoteOut[] {
  const rank = (ix: IndexQuoteOut) => {
    const i = PREFERRED_INDEX_ORDER.indexOf(normalise(ix.name) as (typeof PREFERRED_INDEX_ORDER)[number]);
    return i === -1 ? PREFERRED_INDEX_ORDER.length : i;
  };
  return indices
    .map((ix, position) => ({ ix, position }))
    .sort((a, b) => rank(a.ix) - rank(b.ix) || a.position - b.position)
    .slice(0, limit)
    .map((e) => e.ix);
}
