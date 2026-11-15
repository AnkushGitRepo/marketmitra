import { holdingReturnPct, type HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import type { AnalystStatus, ThesisCriterion } from '@/lib/analysts/types';
import { DEFAULT_DRAWDOWN_PCT } from './drawdown';
import type { Limits } from './profiles';

/** What the rules say about this holding, most pressing first: a breached thesis criterion, a deep drawdown, or a weight over the stock limit. */
export type RuleStatus = 'review' | 'drawdown' | 'overweight' | 'within';
export type AnalystState = 'ready' | 'preparing' | 'none';

export interface AnalystView {
  readonly symbol: string;
  readonly status: AnalystStatus;
  readonly hasDossier: boolean;
  readonly criteria: readonly ThesisCriterion[] | null;
}

export interface TrackerRow {
  readonly symbol: string;
  readonly name: string;
  readonly avgPrice: number;
  readonly ltp: number | null;
  readonly returnPct: number | null;
  readonly weightPct: number;
  readonly status: RuleStatus;
  readonly analyst: AnalystState;
}

const analystState = (a: AnalystView | undefined): AnalystState => (!a ? 'none' : a.hasDossier ? 'ready' : 'preparing');
const breached = (a: AnalystView | undefined) => a?.hasDossier === true && a.criteria?.some((c) => c.enabled && c.breached) === true;

/** One row per holding, synced from the holding, its analyst and the user's limits; no manual entry. */
export function trackerRows(holdings: readonly HoldingLike[], analysts: readonly AnalystView[], limits: Limits): TrackerRow[] {
  const bySymbol = new Map(analysts.map((a) => [a.symbol.toUpperCase(), a]));
  const total = holdings.reduce((sum, h) => sum + (h.ltp === null ? 0 : h.quantity * h.ltp), 0);
  return holdings.map((h) => {
    const analyst = bySymbol.get(h.symbol.toUpperCase());
    const returnPct = holdingReturnPct(h);
    const weightPct = total > 0 && h.ltp !== null ? ((h.quantity * h.ltp) / total) * 100 : 0;
    const status: RuleStatus = breached(analyst)
      ? 'review'
      : returnPct !== null && returnPct <= -DEFAULT_DRAWDOWN_PCT
        ? 'drawdown'
        : weightPct > limits.maxStockPct
          ? 'overweight'
          : 'within';
    return { symbol: h.symbol, name: h.name, avgPrice: h.avgPrice, ltp: h.ltp, returnPct, weightPct, status, analyst: analystState(analyst) };
  });
}
