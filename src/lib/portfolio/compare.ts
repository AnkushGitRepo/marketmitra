export interface Close {
  readonly date: string;
  readonly close: number;
}

/** The benchmark's last close on or before each date (dates ascending); null where it has not started yet. */
export function alignToDates(dates: readonly string[], closes: readonly Close[]): (number | null)[] {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  let j = -1;
  return dates.map((d) => {
    while (j + 1 < sorted.length && sorted[j + 1].date <= d) j += 1;
    return j >= 0 ? sorted[j].close : null;
  });
}

/** Percent change from the first value; null when there is no usable start. */
export function returnPct(values: readonly (number | null)[]): (number | null)[] {
  const first = values.find((v): v is number => v !== null && v !== 0);
  if (first === undefined) return values.map(() => null);
  return values.map((v) => (v === null ? null : (v / first - 1) * 100));
}

/** Portfolio return minus benchmark return over the same window, in percentage points; null if either end is missing. */
export function alphaPct(portfolio: readonly (number | null)[], benchmark: readonly (number | null)[]): number | null {
  const p = portfolio[portfolio.length - 1];
  const b = benchmark[benchmark.length - 1];
  return p === null || p === undefined || b === null || b === undefined ? null : p - b;
}

/** How many points ahead the range fan reaches, as a share of the window it is built from. */
export const FAN_HORIZON_SHARE = 0.3;
/** Standard deviations either side of the last value that the fan covers. */
export const FAN_SIGMAS = 1;
const MIN_POINTS = 8;

export interface Fan {
  readonly lo: number[];
  readonly hi: number[];
}

/**
 * A statistical range, not a forecast: the portfolio's own step-to-step log-return spread, widened by the square root
 * of the steps ahead, either side of the last value, with no drift. Null when the history is too short to measure.
 */
export function volatilityFan(values: readonly number[]): Fan | null {
  if (values.length < MIN_POINTS || values.some((v) => v <= 0)) return null;
  const rets = values.slice(1).map((v, i) => Math.log(v / values[i]));
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
  const sigma = Math.sqrt(variance);
  const last = values[values.length - 1];
  const steps = Math.max(2, Math.round(values.length * FAN_HORIZON_SHARE));
  const lo: number[] = [];
  const hi: number[] = [];
  for (let k = 1; k <= steps; k += 1) {
    const spread = FAN_SIGMAS * sigma * Math.sqrt(k);
    lo.push(last * Math.exp(-spread));
    hi.push(last * Math.exp(spread));
  }
  return { lo, hi };
}
