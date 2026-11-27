// Pure board logic for the conviction board (#411): distance to target and ordering. Prices come in as arguments,
// so nothing here touches the network or the clock.

import type { ConvictionTag, TargetDirection } from './schema';

export interface ConvictionEntry {
  id: string;
  symbol: string;
  tag: ConvictionTag;
  waitFor: string | null;
  targetPrice: number | null;
  targetDirection: TargetDirection;
  noteId: string | null;
}

export type TargetState = 'reached' | 'near' | 'waiting' | 'no_target' | 'no_price';

export interface BoardRow extends ConvictionEntry {
  price: number | null;
  state: TargetState;
  /** How far the price still has to move to touch the target, in percent of the current price. 0 once reached. */
  distancePct: number | null;
}

/** Within this many percent of the target a row reads as "near". */
export const NEAR_PCT = 5;

const TAG_RANK: Record<ConvictionTag, number> = { high: 0, wait: 1, tracking: 2 };

export function targetReached(price: number, target: number, direction: TargetDirection): boolean {
  return direction === 'at_or_below' ? price <= target : price >= target;
}

export function describeTarget(
  price: number | null | undefined,
  target: number | null,
  direction: TargetDirection
): { state: TargetState; distancePct: number | null } {
  if (target === null) return { state: 'no_target', distancePct: null };
  if (price === null || price === undefined || !(price > 0)) return { state: 'no_price', distancePct: null };
  if (targetReached(price, target, direction)) return { state: 'reached', distancePct: 0 };
  const distancePct = (Math.abs(target - price) / price) * 100;
  return { state: distancePct <= NEAR_PCT ? 'near' : 'waiting', distancePct };
}

const STATE_RANK: Record<TargetState, number> = { reached: 0, near: 1, waiting: 2, no_price: 3, no_target: 4 };

/** Rows ordered by conviction, then by how close each is to its target; ties keep the input order. */
export function buildBoard(
  entries: readonly ConvictionEntry[],
  prices: Readonly<Record<string, number | undefined>>
): BoardRow[] {
  return entries
    .map((entry, index) => {
      const price = prices[entry.symbol] ?? null;
      return { index, row: { ...entry, price, ...describeTarget(price, entry.targetPrice, entry.targetDirection) } };
    })
    .sort(
      (a, b) =>
        TAG_RANK[a.row.tag] - TAG_RANK[b.row.tag] ||
        STATE_RANK[a.row.state] - STATE_RANK[b.row.state] ||
        (a.row.distancePct ?? Infinity) - (b.row.distancePct ?? Infinity) ||
        a.index - b.index
    )
    .map((x) => x.row);
}
