// Settings the user can change per indicator (#234): which fields each indicator has, their limits and defaults, and the
// name shown for a given choice. Pure; the chart, the legend and the menu all read it so they cannot disagree.

import type { IndicatorId } from '@/components/pro-chart/constants';

export type IndicatorParams = Record<string, number>;
export type StoredParams = Partial<Record<IndicatorId, Partial<IndicatorParams>>>;

export interface ParamSpec {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Whole numbers only (periods); false for a multiplier. */
  integer: boolean;
}

const period = (label = 'Period'): ParamSpec => ({
  key: 'period',
  label,
  min: 2,
  max: 500,
  step: 1,
  integer: true,
});
const mult = (label = 'Multiplier'): ParamSpec => ({
  key: 'mult',
  label,
  min: 0.5,
  max: 10,
  step: 0.1,
  integer: false,
});
const whole = (key: string, label: string, min = 1, max = 200): ParamSpec => ({
  key,
  label,
  min,
  max,
  step: 1,
  integer: true,
});

export const PARAM_SPECS: Partial<Record<IndicatorId, ParamSpec[]>> = {
  sma20: [period()],
  sma50: [period()],
  sma100: [period()],
  sma200: [period()],
  ema20: [period()],
  ema50: [period()],
  ema100: [period()],
  ema200: [period()],
  bb: [period(), mult('Std dev')],
  donchian: [period()],
  supertrend: [period('ATR period'), mult()],
  rsi: [period()],
  macd: [whole('fast', 'Fast', 2), whole('slow', 'Slow', 3), whole('signal', 'Signal', 1)],
  stoch: [
    whole('period', '%K period', 2),
    whole('smoothK', '%K smoothing'),
    whole('smoothD', '%D smoothing'),
  ],
  atr: [period()],
};

export const DEFAULT_PARAMS: Partial<Record<IndicatorId, IndicatorParams>> = {
  sma20: { period: 20 },
  sma50: { period: 50 },
  sma100: { period: 100 },
  sma200: { period: 200 },
  ema20: { period: 20 },
  ema50: { period: 50 },
  ema100: { period: 100 },
  ema200: { period: 200 },
  bb: { period: 20, mult: 2 },
  donchian: { period: 20 },
  supertrend: { period: 10, mult: 3 },
  rsi: { period: 14 },
  macd: { fast: 12, slow: 26, signal: 9 },
  stoch: { period: 14, smoothK: 3, smoothD: 3 },
  atr: { period: 14 },
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** The settings to draw with: the stored ones where valid (rounded and clamped), the defaults otherwise. */
export function resolveParams(
  id: IndicatorId,
  stored: Partial<IndicatorParams> | undefined,
): IndicatorParams {
  const defaults = DEFAULT_PARAMS[id];
  if (!defaults) return {};
  const out: IndicatorParams = {};
  for (const spec of PARAM_SPECS[id] ?? []) {
    const raw = stored?.[spec.key];
    const usable = typeof raw === 'number' && Number.isFinite(raw);
    const value = usable
      ? clamp(spec.integer ? Math.round(raw) : Math.round(raw * 10) / 10, spec.min, spec.max)
      : defaults[spec.key];
    out[spec.key] = value;
  }
  if (id === 'macd' && out.slow <= out.fast) out.slow = out.fast + 1;
  return out;
}

const BASE_TITLES: Partial<Record<IndicatorId, (p: IndicatorParams) => string>> = {
  sma20: (p) => `SMA ${p.period}`,
  sma50: (p) => `SMA ${p.period}`,
  sma100: (p) => `SMA ${p.period}`,
  sma200: (p) => `SMA ${p.period}`,
  ema20: (p) => `EMA ${p.period}`,
  ema50: (p) => `EMA ${p.period}`,
  ema100: (p) => `EMA ${p.period}`,
  ema200: (p) => `EMA ${p.period}`,
  bb: (p) => `Bollinger (${p.period}, ${p.mult})`,
  donchian: (p) => `Donchian (${p.period})`,
  supertrend: (p) => `Supertrend (${p.period}, ${p.mult})`,
  rsi: (p) => `RSI (${p.period})`,
  macd: (p) => `MACD (${p.fast}, ${p.slow}, ${p.signal})`,
  stoch: (p) => `Stochastic (${p.period}, ${p.smoothK}, ${p.smoothD})`,
  atr: (p) => `ATR (${p.period})`,
};

/** Legend / pane name for an indicator with the user's settings applied. */
export function indicatorTitle(
  id: IndicatorId,
  stored: Partial<IndicatorParams> | undefined,
): string {
  const make = BASE_TITLES[id];
  if (make) return make(resolveParams(id, stored));
  return id === 'obv' ? 'OBV' : 'Volume';
}
