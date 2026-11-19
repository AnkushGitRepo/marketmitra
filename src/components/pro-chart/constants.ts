export type IndicatorId =
  | 'volume'
  | 'sma20'
  | 'sma50'
  | 'sma100'
  | 'sma200'
  | 'ema20'
  | 'ema50'
  | 'ema100'
  | 'ema200'
  | 'bb'
  | 'donchian'
  | 'supertrend'
  | 'rsi'
  | 'macd'
  | 'stoch'
  | 'atr'
  | 'obv';

export interface IndicatorDef {
  id: IndicatorId;
  /** Name in the menu. */
  label: string;
  /** Name with its periods, as shown in the chart legend and pane label. */
  title: string;
  hint: string;
  group: 'Overlays' | 'Panes';
  /** Swatch colour in the menu and legend; the same as the line it draws. */
  color: string;
}

/** Series colours for indicators. Literal hex on purpose: lightweight-charts
 * draws to canvas and can't resolve CSS variables. */
export const INDICATOR_COLORS = {
  volume: '#9aa3b2',
  sma20: '#e0a030',
  sma50: '#7c6cf0',
  sma100: '#8d6e4f',
  sma200: '#3b82f6',
  ema20: '#f06fa0',
  ema50: '#17c39a',
  ema100: '#f97316',
  ema200: '#e11d48',
  bb: '#6b8afd',
  donchian: '#06b6d4',
  supertrendUp: '#16a34a',
  supertrendDown: '#dc2626',
  rsi: '#7c6cf0',
  macdLine: '#3b82f6',
  macdSignal: '#e0a030',
  stochK: '#2563eb',
  stochD: '#f59e0b',
  atr: '#d946ef',
  obv: '#64748b',
} as const;

/** The indicators, in the order the menu lists them. */
export const INDICATORS: IndicatorDef[] = [
  {
    id: 'volume',
    label: 'Volume',
    title: 'Volume',
    hint: 'Bars under the price',
    group: 'Overlays',
    color: INDICATOR_COLORS.volume,
  },
  {
    id: 'sma20',
    label: 'SMA 20',
    title: 'SMA 20',
    hint: 'Short-term trend',
    group: 'Overlays',
    color: INDICATOR_COLORS.sma20,
  },
  {
    id: 'sma50',
    label: 'SMA 50',
    title: 'SMA 50',
    hint: 'Medium-term trend',
    group: 'Overlays',
    color: INDICATOR_COLORS.sma50,
  },
  {
    id: 'sma100',
    label: 'SMA 100',
    title: 'SMA 100',
    hint: 'Medium-long trend',
    group: 'Overlays',
    color: INDICATOR_COLORS.sma100,
  },
  {
    id: 'sma200',
    label: 'SMA 200',
    title: 'SMA 200',
    hint: 'Long-term trend',
    group: 'Overlays',
    color: INDICATOR_COLORS.sma200,
  },
  {
    id: 'ema20',
    label: 'EMA 20',
    title: 'EMA 20',
    hint: 'Fast-reacting average',
    group: 'Overlays',
    color: INDICATOR_COLORS.ema20,
  },
  {
    id: 'ema50',
    label: 'EMA 50',
    title: 'EMA 50',
    hint: 'Fast-reacting average',
    group: 'Overlays',
    color: INDICATOR_COLORS.ema50,
  },
  {
    id: 'ema100',
    label: 'EMA 100',
    title: 'EMA 100',
    hint: 'Fast-reacting average',
    group: 'Overlays',
    color: INDICATOR_COLORS.ema100,
  },
  {
    id: 'ema200',
    label: 'EMA 200',
    title: 'EMA 200',
    hint: 'Long-term, fast-reacting',
    group: 'Overlays',
    color: INDICATOR_COLORS.ema200,
  },
  {
    id: 'bb',
    label: 'Bollinger Bands',
    title: 'Bollinger (20, 2)',
    hint: 'Volatility envelope',
    group: 'Overlays',
    color: INDICATOR_COLORS.bb,
  },
  {
    id: 'donchian',
    label: 'Donchian Channel',
    title: 'Donchian (20)',
    hint: '20-day high / low breakout',
    group: 'Overlays',
    color: INDICATOR_COLORS.donchian,
  },
  {
    id: 'supertrend',
    label: 'Supertrend',
    title: 'Supertrend (10, 3)',
    hint: 'Trailing trend stop',
    group: 'Overlays',
    color: INDICATOR_COLORS.supertrendUp,
  },
  {
    id: 'rsi',
    label: 'RSI',
    title: 'RSI (14)',
    hint: 'Momentum, 30/70 levels',
    group: 'Panes',
    color: INDICATOR_COLORS.rsi,
  },
  {
    id: 'macd',
    label: 'MACD',
    title: 'MACD (12, 26, 9)',
    hint: 'Trend + momentum',
    group: 'Panes',
    color: INDICATOR_COLORS.macdLine,
  },
  {
    id: 'stoch',
    label: 'Stochastic',
    title: 'Stochastic (14, 3, 3)',
    hint: 'Momentum, 20/80 levels',
    group: 'Panes',
    color: INDICATOR_COLORS.stochK,
  },
  {
    id: 'atr',
    label: 'ATR',
    title: 'ATR (14)',
    hint: 'Average daily range',
    group: 'Panes',
    color: INDICATOR_COLORS.atr,
  },
  {
    id: 'obv',
    label: 'On-Balance Volume',
    title: 'OBV',
    hint: 'Volume flow with price',
    group: 'Panes',
    color: INDICATOR_COLORS.obv,
  },
];

export const DEFAULT_INDICATORS: IndicatorId[] = ['volume'];

export const INDICATOR_STORAGE_KEY = 'mm:chart:indicators';
export const INDICATOR_PARAMS_STORAGE_KEY = 'mm:chart:indicator-params';
export const TIMEFRAME_STORAGE_KEY = 'mm:chart:timeframe';
/** Day keeps its original key, so drawings made before timeframes existed are still there. */
export const drawingsStorageKey = (symbol: string, timeframe: string = '1d') =>
  timeframe === '1d' ? `mm:chart:drawings:${symbol}` : `mm:chart:drawings:${symbol}:${timeframe}`;
