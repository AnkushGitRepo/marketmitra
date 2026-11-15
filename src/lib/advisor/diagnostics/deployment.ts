import { apportion } from '../allocation/core';
import { sectorWeights, type HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import type { Limits, Target } from './profiles';

// "Where could the next rupees go?" as policy arithmetic. It names no security
// to act on: it shows the split the target allocation implies, how far each
// over-limit position would be diluted, and the room left under sector limits.
// Pure, so identical input gives identical output.

export interface SleeveShare {
  readonly label: string;
  readonly amountINR: number;
  readonly rule: string;
}

export interface LimitGap {
  readonly kind: 'stock' | 'sector';
  readonly name: string;
  readonly beforePct: number;
  /** Weight if the whole amount went somewhere else. */
  readonly afterPct: number;
  readonly limitPct: number;
  /** New money, outside this position, that would bring it to its limit. */
  readonly neededINR: number;
  readonly closesGap: boolean;
  readonly text: string;
}

export interface SectorRoom {
  readonly sector: string;
  readonly roomINR: number;
}

export interface DeploymentView {
  readonly sleeves: readonly SleeveShare[];
  readonly gaps: readonly LimitGap[];
  readonly room: readonly SectorRoom[];
  readonly noGaps: boolean;
  readonly notes: readonly string[];
}

export interface DeploymentInput {
  readonly holdings: readonly HoldingLike[];
  readonly amountINR: number;
  readonly limits: Limits;
  readonly target: Target;
}

const UNCLASSIFIED = 'Other';
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function gapFor(kind: LimitGap['kind'], name: string, value: number, total: number, amount: number, limitPct: number): LimitGap | null {
  const beforePct = (value / total) * 100;
  if (beforePct <= limitPct) return null;
  const neededINR = Math.max(0, (value * 100) / limitPct - total);
  const afterPct = (value / (total + amount)) * 100;
  const closesGap = amount >= neededINR;
  const scope = kind === 'stock' ? 'single-stock' : 'sector';
  const text = closesGap
    ? `${name}: ${beforePct.toFixed(1)}% now, ${afterPct.toFixed(1)}% after ${inr(amount)} goes elsewhere. About ${inr(neededINR)} elsewhere reaches your ${limitPct}% ${scope} limit.`
    : `${name}: ${beforePct.toFixed(1)}% now, ${afterPct.toFixed(1)}% after ${inr(amount)} goes elsewhere. It takes about ${inr(neededINR)} elsewhere to reach your ${limitPct}% ${scope} limit, so this amount closes part of the gap.`;
  return { kind, name, beforePct, afterPct, limitPct, neededINR, closesGap, text };
}

export function simulateDeployment(input: DeploymentInput): DeploymentView {
  const { holdings, limits, target } = input;
  const amount = Math.max(0, Math.round(input.amountINR));
  if (amount === 0) return { sleeves: [], gaps: [], room: [], noGaps: true, notes: ['Enter an amount to see how it would sit against your limits.'] };

  const parts = apportion(amount, [target.indexCorePct, target.satellitePct, target.cashPct]);
  const rule = (pct: number) => `${pct}% of the amount, from your ${target.indexCorePct}/${target.satellitePct}/${target.cashPct} index/satellite/cash target`;
  const sleeves: SleeveShare[] = [
    { label: 'Index core', amountINR: parts[0], rule: rule(target.indexCorePct) },
    { label: 'Satellite stocks', amountINR: parts[1], rule: rule(target.satellitePct) },
    { label: 'Cash reserve', amountINR: parts[2], rule: rule(target.cashPct) },
  ];

  const priced = holdings.filter((h) => h.ltp !== null);
  const total = priced.reduce((sum, h) => sum + h.quantity * (h.ltp ?? 0), 0);
  if (total <= 0) {
    return { sleeves, gaps: [], room: [], noGaps: true, notes: ['No priced holdings, so only the target split is shown.'] };
  }

  const stockGaps = priced
    .map((h) => gapFor('stock', h.symbol, h.quantity * (h.ltp ?? 0), total, amount, limits.maxStockPct))
    .filter((g): g is LimitGap => g !== null);
  const weights = sectorWeights(holdings, Number.POSITIVE_INFINITY);
  const sectorGaps = weights
    .filter((w) => w.name !== UNCLASSIFIED)
    .map((w) => gapFor('sector', w.name, w.value, total, amount, limits.maxSectorPct))
    .filter((g): g is LimitGap => g !== null);
  const gaps = [...stockGaps, ...sectorGaps].sort((a, b) => b.neededINR - a.neededINR);

  const room: SectorRoom[] = weights
    .filter((w) => w.name !== UNCLASSIFIED && w.pct <= limits.maxSectorPct)
    .map((w) => ({ sector: w.name, roomINR: Math.min(amount, Math.max(0, (limits.maxSectorPct / 100) * (total + amount) - w.value)) }))
    .filter((r) => r.roomINR > 0)
    .sort((a, b) => b.roomINR - a.roomINR);

  const noGaps = gaps.length === 0;
  const notes = noGaps
    ? ['Nothing is over a limit, so new money can simply follow your target split.']
    : ['Positions over a limit are diluted by new money placed elsewhere; nothing here needs a sale.'];
  return { sleeves, gaps, room, noGaps, notes };
}
