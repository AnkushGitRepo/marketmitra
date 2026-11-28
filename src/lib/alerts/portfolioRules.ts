// The user's own portfolio rules (#442, ADR 0085): profit milestones, drawdown below average cost, a single-stock
// weight cap and "at its 52-week high". Pure, so it is table-testable. Every line it produces states a number the
// user's own threshold was compared with; it never says what to do about it.

import { formatInr } from '@/lib/dashboard/format';
import type { PortfolioRulesParams } from './types';

export interface RuleHolding {
  readonly symbol: string;
  readonly quantity: number;
  readonly avgPrice: number;
  /** Live price; null when no quote came back (the holding is skipped, never treated as zero). */
  readonly price: number | null;
  readonly week52High: number | null;
}

export type RuleKind = 'milestone' | 'drawdown' | 'weight' | 'high';

export interface RuleHit {
  readonly kind: RuleKind;
  readonly symbol: string;
  /** One factual sentence. */
  readonly line: string;
}

export interface RuleEvaluation {
  readonly hits: readonly RuleHit[];
  /** Keys of every condition that holds now; a condition that clears drops out, so it can announce again later. */
  readonly keptKeys: readonly string[];
}

export const DEFAULT_PORTFOLIO_RULES: PortfolioRulesParams = {
  profitMilestonesPct: [100, 200, 300],
  costDrawdownPct: [10, 25],
  maxPositionWeightPct: 20,
  week52High: true,
};

const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

/** The highest level at or below `value`, or null. */
function highestReached(levels: readonly number[], value: number): number | null {
  const reached = levels.filter((l) => value >= l);
  return reached.length === 0 ? null : Math.max(...reached);
}

/**
 * `sentKeys` are the keys already announced. Only the highest level crossed is announced for a milestone or drawdown
 * (a stock already past +300% is not also announced at +100% and +200%), but every level crossed is remembered so
 * lower ones stay quiet.
 */
export function evaluatePortfolioRules(params: PortfolioRulesParams, holdings: readonly RuleHolding[], sentKeys: readonly string[]): RuleEvaluation {
  const sent = new Set(sentKeys);
  const priced = holdings.filter((h): h is RuleHolding & { price: number } => h.price !== null && h.price > 0 && h.avgPrice > 0);
  const total = priced.reduce((sum, h) => sum + h.quantity * h.price, 0);
  const kept: string[] = [];
  const hits: RuleHit[] = [];

  const consider = (key: string, hit: RuleHit | null) => {
    kept.push(key);
    if (hit && !sent.has(key)) hits.push(hit);
  };

  for (const h of priced) {
    const sym = h.symbol.toUpperCase();
    const gain = (h.price / h.avgPrice - 1) * 100;

    const up = highestReached(params.profitMilestonesPct, gain);
    for (const level of params.profitMilestonesPct.filter((l) => gain >= l)) {
      const isTop = level === up;
      consider(`ms:${sym}:${level}`, isTop ? { kind: 'milestone', symbol: sym, line: `${sym} is up ${pct(gain, 0)} on your average cost (${formatInr(h.price)} against ${formatInr(h.avgPrice)}), past your +${level}% milestone.` } : null);
    }

    const down = highestReached(params.costDrawdownPct, -gain);
    for (const level of params.costDrawdownPct.filter((l) => -gain >= l)) {
      const isTop = level === down;
      consider(`dd:${sym}:${level}`, isTop ? { kind: 'drawdown', symbol: sym, line: `${sym} is ${pct(-gain)} below your average cost (${formatInr(h.price)} against ${formatInr(h.avgPrice)}), past your -${level}% line.` } : null);
    }

    if (params.maxPositionWeightPct !== null && total > 0) {
      const weight = ((h.quantity * h.price) / total) * 100;
      if (weight >= params.maxPositionWeightPct) {
        consider(`wt:${sym}`, { kind: 'weight', symbol: sym, line: `${sym} is ${pct(weight)} of your portfolio value, above your ${pct(params.maxPositionWeightPct, 0)} limit for one stock.` });
      }
    }

    if (params.week52High && h.week52High !== null && h.price >= h.week52High) {
      consider(`hi:${sym}`, { kind: 'high', symbol: sym, line: `${sym} is at its 52-week high of ${formatInr(h.week52High)}.` });
    }
  }

  return { hits, keptKeys: kept };
}
