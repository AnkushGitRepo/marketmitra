// SIP wealth simulator: what a fixed monthly amount would have become. Pure, so it tests
// without a browser. It follows the data service's convention (mf_metrics.sip_xirr): one
// instalment a month, dated back from the latest NAV, priced at the NAV on or before that day.

import type { NavPoint } from './types';

export const SIP_AMOUNTS = [5_000, 10_000, 25_000] as const;
export const SIP_YEARS = [1, 3, 5] as const;

export interface SipPoint {
  readonly date: string;
  readonly invested: number;
  readonly value: number;
}

export interface SipResult {
  readonly points: readonly SipPoint[];
  readonly instalments: number;
  readonly invested: number;
  readonly value: number;
  /** Annualised XIRR in percent; null when it does not converge. */
  readonly xirr: number | null;
}

const DAY_MS = 86_400_000;
/** Same threshold as the data service (mf_metrics.UNIT_CHANGE_THRESHOLD). */
const UNIT_CHANGE_THRESHOLD = 0.4;

const toMs = (iso: string): number => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Remove unit splits and consolidations the way the data service does (mf_metrics.
 * adjust_for_unit_changes): a one-day move beyond the threshold counts as no return that
 * day, and the series is rebuilt from the cleaned daily returns, scaled to end at the real
 * last NAV. A series with no such jump comes back unchanged.
 */
export function adjustForUnitChanges(series: readonly NavPoint[]): readonly NavPoint[] {
  if (series.length < 2) return series;
  const ratios = series.slice(1).map((p, i) => {
    const before = (series[i] as NavPoint).nav;
    return before > 0 ? p.nav / before : 1;
  });
  if (ratios.every((r) => Math.abs(r - 1) <= UNIT_CHANGE_THRESHOLD)) return series;
  const index = ratios.reduce<number[]>(
    (acc, r) => [...acc, (acc[acc.length - 1] as number) * (Math.abs(r - 1) > UNIT_CHANGE_THRESHOLD ? 1 : r)],
    [1],
  );
  const scale = (series[series.length - 1] as NavPoint).nav / (index[index.length - 1] as number);
  return series.map((p, i) => ({ date: p.date, nav: (index[i] as number) * scale }));
}

/** `months` calendar months before `iso`, the day clamped to the end of a shorter month. */
function monthsBefore(iso: string, months: number): string {
  const d = new Date(toMs(iso));
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return toIso(target.getTime());
}

/** NAV of the last point on or before `iso`; `series` is sorted by date ascending. */
function navOnOrBefore(series: readonly NavPoint[], iso: string): number | null {
  let lo = 0;
  let hi = series.length - 1;
  let found: NavPoint | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = series[mid] as NavPoint;
    if (point.date.slice(0, 10) <= iso) {
      found = point;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found && Number.isFinite(found.nav) && found.nav > 0 ? found.nav : null;
}

interface Flow {
  readonly ms: number;
  readonly amount: number;
}

function xirrPercent(flows: readonly Flow[]): number | null {
  const t0 = (flows[0] as Flow).ms;
  const npv = (rate: number): number => flows.reduce((sum, f) => sum + f.amount / (1 + rate) ** ((f.ms - t0) / DAY_MS / 365), 0);
  let lo = -0.99;
  let hi = 10;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid;
    else lo = mid;
  }
  return ((lo + hi) / 2) * 100;
}

/**
 * Simulate a monthly SIP of `monthlyAmount` over the trailing `years`, or null when the
 * inputs are invalid or the fund is younger than the window (never extrapolated).
 */
export function simulateSip(rawSeries: readonly NavPoint[], monthlyAmount: number, years: number): SipResult | null {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0 || !Number.isInteger(years) || years < 1) return null;
  if (rawSeries.length < 2) return null;
  // Checked before adjusting, so a bad NAV is refused and not smoothed over.
  if (rawSeries.some((p) => !Number.isFinite(p.nav) || p.nav <= 0)) return null;
  const series = adjustForUnitChanges(rawSeries);
  const last = series[series.length - 1] as NavPoint;
  const first = series[0] as NavPoint;
  const months = years * 12;
  if (first.date.slice(0, 10) > monthsBefore(last.date, months)) return null;
  if (!Number.isFinite(last.nav) || last.nav <= 0) return null;

  const points: SipPoint[] = [];
  const flows: Flow[] = [];
  let units = 0;
  for (let i = 0; i < months; i++) {
    const date = monthsBefore(last.date, months - i);
    const nav = navOnOrBefore(series, date);
    if (nav === null) return null;
    units += monthlyAmount / nav;
    const invested = monthlyAmount * (i + 1);
    points.push({ date, invested, value: units * nav });
    flows.push({ ms: toMs(date), amount: -monthlyAmount });
  }
  const invested = monthlyAmount * months;
  const value = units * last.nav;
  points.push({ date: last.date.slice(0, 10), invested, value });
  flows.push({ ms: toMs(last.date), amount: value });

  return { points, instalments: months, invested, value, xirr: xirrPercent(flows) };
}
