// What-if rebalancing maths for the Portfolio sandbox (#413). Pure: holdings, cash and the hypothetical legs come in
// as arguments and a new result comes out. Nothing is saved or traded, and nothing here is advice; it is arithmetic
// on the user's own numbers.

import type { HoldingLike } from './portfolioMetrics';

export const OTHER_SECTOR = 'Other';
export const CASH_NAME = 'Cash';

export type WhatIfLeg =
  /** Put `amount` rupees into a stock. A symbol not held needs a `sector` (else it counts as Other). */
  | { readonly kind: 'add'; readonly symbol: string; readonly amount: number; readonly sector?: string | null; readonly fromCash?: boolean }
  /** Sell `shares` of a holding; the proceeds stay in the portfolio as cash. */
  | { readonly kind: 'trim'; readonly symbol: string; readonly shares: number };

export interface Snapshot {
  /** Equity value plus cash. */
  readonly total: number;
  readonly equity: number;
  readonly cash: number;
  readonly cashPct: number;
  /** Sector shares of the equity part, largest first (the same basis as the Sector allocation card). */
  readonly sectors: ReadonlyArray<{ readonly name: string; readonly pct: number }>;
  readonly topSector: { readonly name: string; readonly pct: number } | null;
  readonly top3Pct: number;
  readonly largest: { readonly symbol: string; readonly pct: number } | null;
}

export interface WhatIfResult {
  readonly before: Snapshot;
  readonly after: Snapshot;
  /** Legs that could not be applied as asked, in plain words. */
  readonly warnings: readonly string[];
}

interface Position {
  readonly symbol: string;
  readonly sector: string;
  readonly value: number;
  readonly shares: number;
  readonly price: number | null;
}

const upper = (s: string) => s.trim().toUpperCase();

function positionsOf(holdings: readonly HoldingLike[]): Position[] {
  return holdings
    .filter((h) => h.ltp !== null)
    .map((h) => ({ symbol: upper(h.symbol), sector: h.sector ?? OTHER_SECTOR, value: h.quantity * (h.ltp as number), shares: h.quantity, price: h.ltp }));
}

function snapshotOf(positions: readonly Position[], cash: number): Snapshot {
  const equity = positions.reduce((s, p) => s + p.value, 0);
  const total = equity + cash;
  const bySector = new Map<string, number>();
  for (const p of positions) bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + p.value);
  const sectors = [...bySector]
    .map(([name, value]) => ({ name, pct: equity > 0 ? (value / equity) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const byValue = [...positions].sort((a, b) => b.value - a.value);
  return {
    total,
    equity,
    cash,
    cashPct: total > 0 ? (cash / total) * 100 : 0,
    sectors,
    topSector: sectors[0] ?? null,
    top3Pct: equity > 0 ? (byValue.slice(0, 3).reduce((s, p) => s + p.value, 0) / equity) * 100 : 0,
    largest: byValue[0] && equity > 0 ? { symbol: byValue[0].symbol, pct: (byValue[0].value / equity) * 100 } : null,
  };
}

/** Applies the legs in order to copies of the positions and cash, and reports the portfolio before and after. */
export function simulateWhatIf(holdings: readonly HoldingLike[], cash: number, legs: readonly WhatIfLeg[]): WhatIfResult {
  const startPositions = positionsOf(holdings);
  const startCash = Math.max(cash, 0);
  const before = snapshotOf(startPositions, startCash);
  const warnings: string[] = [];

  let positions = startPositions;
  let cashLeft = startCash;

  for (const leg of legs) {
    const symbol = upper(leg.symbol);
    const held = positions.find((p) => p.symbol === symbol);
    if (leg.kind === 'add') {
      if (!(leg.amount > 0) || !Number.isFinite(leg.amount)) {
        warnings.push(`${symbol}: enter an amount above zero.`);
        continue;
      }
      let amount = leg.amount;
      if (leg.fromCash) {
        if (amount > cashLeft) warnings.push(`${symbol}: only ₹${Math.round(cashLeft).toLocaleString('en-IN')} of cash is available, so that is what was used.`);
        amount = Math.min(amount, cashLeft);
        cashLeft -= amount;
      }
      positions = held
        ? positions.map((p) => (p.symbol === symbol ? { ...p, value: p.value + amount } : p))
        : [...positions, { symbol, sector: leg.sector?.trim() || OTHER_SECTOR, value: amount, shares: 0, price: null }];
    } else {
      if (!held) {
        warnings.push(`${symbol}: you do not hold this, so there is nothing to trim.`);
        continue;
      }
      if (!(leg.shares > 0) || !Number.isFinite(leg.shares)) {
        warnings.push(`${symbol}: enter a number of shares above zero.`);
        continue;
      }
      const shares = Math.min(leg.shares, held.shares);
      if (leg.shares > held.shares) warnings.push(`${symbol}: you hold ${held.shares}, so ${held.shares} was used.`);
      const proceeds = held.price === null ? 0 : shares * held.price;
      cashLeft += proceeds;
      positions = positions
        .map((p) => (p.symbol === symbol ? { ...p, value: p.value - proceeds, shares: p.shares - shares } : p))
        .filter((p) => p.value > 0.005);
    }
  }
  return { before, after: snapshotOf(positions, cashLeft), warnings };
}

/** Sector slices with a Cash slice added (and the others scaled down to make room), for the allocation donut. */
export function withCashSlice<T extends { readonly name: string; readonly value: number; readonly pct: number }>(
  weights: readonly T[],
  cash: number
): Array<{ readonly name: string; readonly value: number; readonly pct: number }> {
  const equity = weights.reduce((s, w) => s + w.value, 0);
  const total = equity + Math.max(cash, 0);
  if (total <= 0) return [];
  const slices = weights.map((w) => ({ name: w.name, value: w.value, pct: (w.value / total) * 100 }));
  return cash > 0 ? [...slices, { name: CASH_NAME, value: cash, pct: (cash / total) * 100 }] : slices;
}
