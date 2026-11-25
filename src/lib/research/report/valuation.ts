// Valuation against the company's own history and its peers (#360). The only inputs are stored figures: annual EPS,
// the price history and the current ratios. Pure.

import type { PricePointOut } from '@/lib/dashboard/fundamentalsApi';
import { median, toNumber } from '../formatters';
import type { YearFigures } from './statements';

export interface PeAtYearEnd {
  readonly periodEnd: string;
  readonly label: string;
  readonly price: number | null;
  readonly eps: number | null;
  readonly pe: number | null;
}

/** A closing price counts for a year end if it is from the last week up to that date (a weekend or holiday). */
const PRICE_WINDOW_DAYS = 7;
/** Beyond this the ratio is almost certainly a split, a bonus or near-zero earnings, not a valuation. */
const MAX_PLAUSIBLE_PE = 300;
const MIN_YEARS_FOR_MEDIAN = 3;
const DAY_MS = 86_400_000;

function closeOnOrBefore(prices: readonly PricePointOut[], date: string): number | null {
  const limit = new Date(date).getTime();
  let best: { time: number; close: number } | null = null;
  for (const p of prices) {
    const close = toNumber(p.close);
    const time = new Date(p.trade_date).getTime();
    if (close === null || close <= 0 || time > limit || limit - time > PRICE_WINDOW_DAYS * DAY_MS) continue;
    if (!best || time > best.time) best = { time, close };
  }
  return best?.close ?? null;
}

/** Price at each fiscal year end over that year's EPS. A year with no price, no positive EPS or an implausible ratio has no P/E. */
export function peAtYearEnds(years: readonly YearFigures[], prices: readonly PricePointOut[] | null): PeAtYearEnd[] {
  return years.map((y) => {
    const price = closeOnOrBefore(prices ?? [], y.periodEnd);
    const pe = price !== null && y.eps !== null && y.eps > 0 ? price / y.eps : null;
    return { periodEnd: y.periodEnd, label: y.label, price, eps: y.eps, pe: pe !== null && pe <= MAX_PLAUSIBLE_PE ? pe : null };
  });
}

/** The company's own median P/E over its year ends, when at least three years have one. */
export function ownMedianPe(history: readonly PeAtYearEnd[]): { value: number; years: number } | null {
  const values = history.map((h) => h.pe).filter((v): v is number => v !== null);
  const value = values.length >= MIN_YEARS_FOR_MEDIAN ? median(values) : null;
  return value === null ? null : { value, years: values.length };
}

export type ScenarioName = 'Bear' | 'Base' | 'Bull';

export interface Scenario {
  readonly name: ScenarioName;
  readonly salesGrowth: number;
  readonly margin: number;
  readonly sales: number;
  readonly operatingProfit: number;
}

export interface ScenarioSet {
  /** The year the scenarios are applied to, e.g. "FY26". */
  readonly from: string;
  readonly scenarios: readonly Scenario[];
}

const MIN_OBSERVATIONS = 2;

/** The value at fraction `q` (0 to 1) of the sorted values, interpolating between neighbours. */
export function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  const high = Math.ceil(at);
  return sorted[low] + (sorted[high] - sorted[low]) * (at - low);
}

const SCENARIO_QUANTILE: Record<ScenarioName, number> = { Bear: 0.25, Base: 0.5, Bull: 0.75 };

/**
 * What the company's own history implies for next year: the lower quartile, median and upper quartile of the sales growth
 * and operating margin of the years on record, applied to the latest year. Quartiles, not the single best and worst year,
 * so one outlier year does not set the range. A range drawn from the past, not a forecast. Null when there are fewer
 * than two growth rates or two margins to draw it from.
 */
export function scenariosFromHistory(years: readonly YearFigures[]): ScenarioSet | null {
  const growth: number[] = [];
  for (let i = 1; i < years.length; i += 1) {
    const [a, b] = [years[i - 1].sales, years[i].sales];
    if (a !== null && b !== null && a > 0) growth.push(((b - a) / a) * 100);
  }
  const margins = years.filter((y) => y.sales !== null && y.sales > 0 && y.operatingProfit !== null).map((y) => ((y.operatingProfit as number) / (y.sales as number)) * 100);
  const latest = [...years].reverse().find((y) => y.sales !== null && y.sales > 0);
  if (growth.length < MIN_OBSERVATIONS || margins.length < MIN_OBSERVATIONS || !latest) return null;

  const pick = (values: readonly number[], name: ScenarioName): number => quantile(values, SCENARIO_QUANTILE[name]);
  const base = latest.sales as number;
  return {
    from: latest.label,
    scenarios: (['Bear', 'Base', 'Bull'] as const).map((name) => {
      const salesGrowth = pick(growth, name);
      const margin = pick(margins, name);
      const sales = base * (1 + salesGrowth / 100);
      return { name, salesGrowth, margin, sales, operatingProfit: (sales * margin) / 100 };
    }),
  };
}
