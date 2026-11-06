export type IndicatorId = 'volume' | 'sma20' | 'sma50' | 'sma200' | 'ema20' | 'ema50' | 'bb' | 'rsi' | 'macd';

export interface IndicatorDef {
  id: IndicatorId;
  label: string;
  hint: string;
  group: 'Overlays' | 'Panes';
}

/** The most-used indicators, in the order the menu lists them. */
export const INDICATORS: IndicatorDef[] = [
  { id: 'volume', label: 'Volume', hint: 'Bars under the price', group: 'Overlays' },
  { id: 'sma20', label: 'SMA 20', hint: 'Short-term trend', group: 'Overlays' },
  { id: 'sma50', label: 'SMA 50', hint: 'Medium-term trend', group: 'Overlays' },
  { id: 'sma200', label: 'SMA 200', hint: 'Long-term trend', group: 'Overlays' },
  { id: 'ema20', label: 'EMA 20', hint: 'Fast-reacting average', group: 'Overlays' },
  { id: 'ema50', label: 'EMA 50', hint: 'Fast-reacting average', group: 'Overlays' },
  { id: 'bb', label: 'Bollinger Bands (20, 2)', hint: 'Volatility envelope', group: 'Overlays' },
  { id: 'rsi', label: 'RSI (14)', hint: 'Momentum, 30/70 levels', group: 'Panes' },
  { id: 'macd', label: 'MACD (12, 26, 9)', hint: 'Trend + momentum', group: 'Panes' },
];

export const DEFAULT_INDICATORS: IndicatorId[] = ['volume'];

/** Series colours for indicators. Literal hex on purpose: lightweight-charts
 * draws to canvas and can't resolve CSS variables. */
export const INDICATOR_COLORS = {
  sma20: '#e0a030',
  sma50: '#7c6cf0',
  sma200: '#3b82f6',
  ema20: '#f06fa0',
  ema50: '#17c39a',
  bb: '#6b8afd',
  rsi: '#7c6cf0',
  macdLine: '#3b82f6',
  macdSignal: '#e0a030',
} as const;

export const INDICATOR_STORAGE_KEY = 'mm:chart:indicators';
export const drawingsStorageKey = (symbol: string) => `mm:chart:drawings:${symbol}`;
