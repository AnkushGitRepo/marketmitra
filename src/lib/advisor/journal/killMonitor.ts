import { deriveRoce } from '../screen/rules';
import type { ScreenData } from '../screen/types';
import type { KillMetric } from '../memo/types';

// Thesis monitoring: decides whether a kill criterion has fired, from the same
// normalised data the screen uses. Pure and LLM-free — a criterion is a number
// and a comparison, so firing is a fact, not a judgement.

export interface KillRule {
  metric: KillMetric;
  operator: '<' | '>';
  threshold: number;
  consecutivePeriods: number;
  periodUnit: 'year' | 'quarter';
}

export type KillStatus = 'fired' | 'ok' | 'unknown';
export interface KillCheck {
  status: KillStatus;
  /** The values compared, newest first (null = unavailable). */
  observed: Array<number | null>;
  detail: string;
}

interface Series {
  unit: 'year' | 'quarter';
  /** Newest first. */
  values: Array<number | null>;
}

function growth(values: Array<number | null>): Array<number | null> {
  // values newest first; growth of i vs i+1
  return values.slice(0, -1).map((v, i) => {
    const prior = values[i + 1];
    return v === null || prior === null || prior <= 0 ? null : ((v - prior) / prior) * 100;
  });
}

export function seriesFor(metric: KillMetric, data: ScreenData): Series {
  switch (metric) {
    case 'roce_pct':
      return { unit: 'year', values: data.annual.map(deriveRoce) };
    case 'debt_to_equity':
      return {
        unit: 'year',
        values: data.annual.map((y) => {
          if (y.borrowings === null || y.equityCapital === null || y.reserves === null) return null;
          const equity = y.equityCapital + y.reserves;
          return equity > 0 ? y.borrowings / equity : null;
        }),
      };
    case 'free_cash_flow_cr':
      return { unit: 'year', values: data.annual.map((y) => y.freeCashFlow) };
    case 'revenue_growth_pct':
      return { unit: 'year', values: growth(data.annual.map((y) => y.sales)) };
    case 'net_profit_growth_pct':
      return { unit: 'year', values: growth(data.annual.map((y) => y.netProfit)) };
    case 'promoter_holding_pct':
      return { unit: 'quarter', values: data.promoter.map((p) => p.pct) };
    case 'promoter_pledge_pct':
      // Only the current figure is ever available.
      return { unit: 'quarter', values: [data.promoterPledgePct] };
  }
}

export function evaluateKill(rule: KillRule, data: ScreenData): KillCheck {
  const series = seriesFor(rule.metric, data);
  if (series.unit !== rule.periodUnit) {
    return { status: 'unknown', observed: [], detail: `${rule.metric} is only available per ${series.unit}, not per ${rule.periodUnit}.` };
  }
  const window = series.values.slice(0, rule.consecutivePeriods);
  if (window.length < rule.consecutivePeriods || window.some((v) => v === null)) {
    return { status: 'unknown', observed: window, detail: 'Not enough data to evaluate this criterion.' };
  }
  const breached = (window as number[]).every((v) =>
    rule.operator === '<' ? v < rule.threshold : v > rule.threshold,
  );
  return {
    status: breached ? 'fired' : 'ok',
    observed: window,
    detail: breached
      ? `${rule.metric} was ${rule.operator} ${rule.threshold} for the last ${rule.consecutivePeriods} ${rule.periodUnit}(s).`
      : 'Not breached.',
  };
}

/** Stable identity of a criterion, so one breach notifies once. */
export const killKey = (r: KillRule) =>
  `${r.metric}${r.operator}${r.threshold}x${r.consecutivePeriods}${r.periodUnit}`;
