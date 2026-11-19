/** Technical-indicator math. Every function returns an array the same length
 * as its input, with `null` where the indicator isn't defined yet, so results
 * line up index-for-index with the bars they were computed from. */

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** EMA seeded with the SMA of the first `period` values (the TradingView/
 * standard convention), multiplier 2/(period+1). */
export function ema(values: number[], period: number): Series {
  const out: Series = Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): { mid: Series; upper: Series; lower: Series } {
  const mid = sma(values, period);
  const upper: Series = Array(values.length).fill(null);
  const lower: Series = Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const mean = mid[i] as number;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (values[j] - mean) ** 2;
    const sd = Math.sqrt(variance / period); // population σ, as TradingView uses
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { mid, upper, lower };
}

/** Wilder's RSI. */
export function rsi(values: number[], period = 14): Series {
  const out: Series = Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const toRsi = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[period] = toRsi();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi();
  }
  return out;
}

export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): { line: Series; signal: Series; histogram: Series } {
  const fastEma = ema(values, fast);
  const slowEma = ema(values, slow);
  const line: Series = values.map((_, i) =>
    fastEma[i] !== null && slowEma[i] !== null
      ? (fastEma[i] as number) - (slowEma[i] as number)
      : null,
  );
  const first = line.findIndex((v) => v !== null);
  const signal: Series = Array(values.length).fill(null);
  if (first >= 0) {
    const sig = ema(line.slice(first) as number[], signalPeriod);
    sig.forEach((v, i) => {
      signal[first + i] = v;
    });
  }
  const histogram: Series = line.map((v, i) =>
    v !== null && signal[i] !== null ? v - (signal[i] as number) : null,
  );
  return { line, signal, histogram };
}

/** True range of each bar (the first bar has no previous close, so it is high - low). */
function trueRange(high: number[], low: number[], close: number[]): number[] {
  return high.map((h, i) =>
    i === 0
      ? h - low[i]
      : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])),
  );
}

/** Wilder's ATR, seeded with the mean true range of bars 1..period (bar 0 has no previous close). */
export function atr(high: number[], low: number[], close: number[], period = 14): Series {
  const out: Series = Array(close.length).fill(null);
  if (close.length <= period) return out;
  const tr = trueRange(high, low, close);
  let prev = tr.slice(1, period + 1).reduce((a, b) => a + b, 0) / period;
  out[period] = prev;
  for (let i = period + 1; i < close.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }
  return out;
}

/** Slow stochastic: raw %K over `period`, smoothed by `smoothK`, then %D = SMA(%K, `smoothD`). A flat window reads 50. */
export function stochastic(
  high: number[],
  low: number[],
  close: number[],
  period = 14,
  smoothK = 3,
  smoothD = 3,
): { k: Series; d: Series } {
  const raw: Series = Array(close.length).fill(null);
  for (let i = period - 1; i < close.length; i++) {
    const hh = Math.max(...high.slice(i - period + 1, i + 1));
    const ll = Math.min(...low.slice(i - period + 1, i + 1));
    raw[i] = hh === ll ? 50 : (100 * (close[i] - ll)) / (hh - ll);
  }
  const smooth = (src: Series, n: number): Series => {
    const first = src.findIndex((v) => v !== null);
    const out: Series = Array(src.length).fill(null);
    if (first < 0) return out;
    sma(src.slice(first) as number[], n).forEach((v, i) => {
      out[first + i] = v;
    });
    return out;
  };
  const k = smoothK > 1 ? smooth(raw, smoothK) : raw;
  return { k, d: smooth(k, smoothD) };
}

/** On-balance volume: running total of volume signed by the close-to-close direction. */
export function obv(close: number[], volume: number[]): number[] {
  const out: number[] = [];
  let total = 0;
  close.forEach((c, i) => {
    if (i > 0) total += c > close[i - 1] ? volume[i] : c < close[i - 1] ? -volume[i] : 0;
    out.push(total);
  });
  return out;
}

export function donchian(
  high: number[],
  low: number[],
  period = 20,
): { upper: Series; lower: Series; mid: Series } {
  const upper: Series = Array(high.length).fill(null);
  const lower: Series = Array(high.length).fill(null);
  const mid: Series = Array(high.length).fill(null);
  for (let i = period - 1; i < high.length; i++) {
    const hh = Math.max(...high.slice(i - period + 1, i + 1));
    const ll = Math.min(...low.slice(i - period + 1, i + 1));
    upper[i] = hh;
    lower[i] = ll;
    mid[i] = (hh + ll) / 2;
  }
  return { upper, lower, mid };
}

/** Supertrend: an ATR band that trails price. `up[i]` is true while price is above the line (line sits below price). */
export function supertrend(
  high: number[],
  low: number[],
  close: number[],
  period = 10,
  multiplier = 3,
): { line: Series; up: (boolean | null)[] } {
  const a = atr(high, low, close, period);
  const line: Series = Array(close.length).fill(null);
  const up: (boolean | null)[] = Array(close.length).fill(null);
  let upper = 0;
  let lower = 0;
  let trendUp = true;
  for (let i = 0; i < close.length; i++) {
    const range = a[i];
    if (range === null) continue;
    const mid = (high[i] + low[i]) / 2;
    const basicUpper = mid + multiplier * range;
    const basicLower = mid - multiplier * range;
    if (line[i - 1] === null || line[i - 1] === undefined) {
      upper = basicUpper;
      lower = basicLower;
      trendUp = close[i] >= mid;
    } else {
      // A band only tightens toward price, unless price closed through the previous band.
      upper = basicUpper < upper || close[i - 1] > upper ? basicUpper : upper;
      lower = basicLower > lower || close[i - 1] < lower ? basicLower : lower;
      if (trendUp && close[i] < lower) trendUp = false;
      else if (!trendUp && close[i] > upper) trendUp = true;
    }
    up[i] = trendUp;
    line[i] = trendUp ? lower : upper;
  }
  return { line, up };
}
