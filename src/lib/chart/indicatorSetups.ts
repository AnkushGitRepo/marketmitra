// Indicator setups (#259): a named set of indicators with their settings, so a whole chart layout is one click. Ready-made ones for
// different kinds of user, plus the user's own, kept in the browser. Pure: the chart owns the state and the storage.

import { INDICATORS, type IndicatorId } from '@/components/pro-chart/constants';
import {
  DEFAULT_PARAMS,
  resolveParams,
  type IndicatorParams,
  type StoredParams,
} from './indicatorParams';

export interface IndicatorSetup {
  id: string;
  name: string;
  indicators: IndicatorId[];
  /** Only the settings that differ from the indicator's defaults. */
  params: StoredParams;
}

export interface BuiltInSetup extends IndicatorSetup {
  /** Who it is for and what it shows, one line. */
  hint: string;
}

export const MAX_CUSTOM_SETUPS = 12;
const MAX_NAME_LENGTH = 30;

export const BUILT_IN_SETUPS: readonly BuiltInSetup[] = [
  {
    id: 'investor',
    name: 'Long-term investor',
    hint: 'Where price stands against the 50 and 200 averages, with RSI and MACD for momentum',
    indicators: ['volume', 'sma50', 'sma200', 'rsi', 'macd'],
    params: {},
  },
  {
    id: 'swing',
    name: 'Swing trader',
    hint: 'Trend (20/50 EMA, Supertrend) plus RSI and MACD for entries over days to weeks',
    indicators: ['volume', 'ema20', 'ema50', 'supertrend', 'rsi', 'macd'],
    params: {},
  },
  {
    id: 'intraday',
    name: 'Intraday trader',
    hint: 'Fast 9/21 EMAs, Bollinger bands, a quick RSI and Stochastic for short moves',
    indicators: ['volume', 'ema20', 'ema50', 'bb', 'rsi', 'stoch'],
    params: { ema20: { period: 9 }, ema50: { period: 21 }, rsi: { period: 9 } },
  },
  {
    id: 'breakout',
    name: 'Breakout & momentum',
    hint: 'Donchian channel highs and lows, ATR for volatility, MACD and volume to confirm',
    indicators: ['volume', 'ema20', 'donchian', 'atr', 'macd'],
    params: {},
  },
  {
    id: 'reversion',
    name: 'Mean reversion',
    hint: 'Bollinger bands and the 20 average with RSI and Stochastic to spot stretched prices',
    indicators: ['sma20', 'bb', 'rsi', 'stoch'],
    params: {},
  },
  {
    id: 'researcher',
    name: 'Researcher',
    hint: 'Trend, volatility and volume flow side by side: 50/200 averages, Bollinger, RSI, ATR, OBV',
    indicators: ['sma50', 'sma200', 'bb', 'rsi', 'atr', 'obv'],
    params: {},
  },
];

const KNOWN = new Set<string>(INDICATORS.map((i) => i.id));
const isIndicatorId = (v: unknown): v is IndicatorId => typeof v === 'string' && KNOWN.has(v);

/** The settings that differ from the defaults, for the given indicators only. */
function changedParams(indicators: IndicatorId[], params: StoredParams): StoredParams {
  const out: StoredParams = {};
  for (const id of indicators) {
    const defaults = DEFAULT_PARAMS[id];
    if (!defaults) continue;
    const resolved = resolveParams(id, params[id]);
    const diff: Partial<IndicatorParams> = {};
    for (const key of Object.keys(defaults)) {
      if (resolved[key] !== defaults[key]) diff[key] = resolved[key];
    }
    if (Object.keys(diff).length > 0) out[id] = diff;
  }
  return out;
}

const sameParams = (id: IndicatorId, a: StoredParams, b: StoredParams): boolean => {
  const x = resolveParams(id, a[id]);
  const y = resolveParams(id, b[id]);
  return Object.keys(x).every((k) => x[k] === y[k]);
};

/** The setup the chart shows right now: same indicators (any order) with the same effective settings. Null when none. */
export function matchingSetupId(
  setups: readonly IndicatorSetup[],
  active: readonly IndicatorId[],
  params: StoredParams,
): string | null {
  const on = new Set(active);
  const hit = setups.find(
    (s) =>
      s.indicators.length === on.size &&
      s.indicators.every((id) => on.has(id) && sameParams(id, s.params, params)),
  );
  return hit?.id ?? null;
}

/** A new custom setup from what is on the chart. Same name (any case) replaces; the newest are kept past the cap. */
export function addCustomSetup(
  existing: readonly IndicatorSetup[],
  rawName: string,
  indicators: readonly IndicatorId[],
  params: StoredParams,
  id: string,
): IndicatorSetup[] {
  const name = rawName.trim().slice(0, MAX_NAME_LENGTH);
  if (!name || indicators.length === 0) return [...existing];
  const kept = existing.filter((s) => s.name.toLowerCase() !== name.toLowerCase());
  const list = [
    ...kept,
    { id, name, indicators: [...indicators], params: changedParams([...indicators], params) },
  ];
  return list.slice(-MAX_CUSTOM_SETUPS);
}

/** Stored setups read back from the browser: anything malformed or unknown is dropped, never trusted. */
export function parseCustomSetups(raw: unknown): IndicatorSetup[] {
  if (!Array.isArray(raw)) return [];
  const out: IndicatorSetup[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { id, name, indicators, params } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || !name.trim()) continue;
    const ids = Array.isArray(indicators) ? indicators.filter(isIndicatorId) : [];
    if (ids.length === 0) continue;
    const stored: StoredParams = {};
    if (typeof params === 'object' && params !== null) {
      for (const pid of ids) {
        const p = (params as Record<string, unknown>)[pid];
        if (typeof p !== 'object' || p === null) continue;
        const clean: Partial<IndicatorParams> = {};
        for (const [k, v] of Object.entries(p)) {
          if (typeof v === 'number' && Number.isFinite(v)) clean[k] = v;
        }
        if (Object.keys(clean).length > 0) stored[pid] = clean;
      }
    }
    out.push({
      id,
      name: name.trim().slice(0, MAX_NAME_LENGTH),
      indicators: [...new Set(ids)],
      params: changedParams([...new Set(ids)], stored),
    });
  }
  return out.slice(-MAX_CUSTOM_SETUPS);
}
