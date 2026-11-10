// Alert banner tones, exactly as specified in the design README.

export type AlertEmailType = 'STOP-LOSS' | 'DRAWDOWN' | 'PRICE TARGET' | 'BIG MOVE' | '52-WEEK' | 'PORTFOLIO';
export type AlertTone = 'loss' | 'warn' | 'gain';
export type Direction = 'up' | 'down';

export const TONE_COLORS: Record<AlertTone, { readonly bg: string; readonly border: string; readonly fg: string }> = {
  loss: { bg: '#fbe9e4', border: '#f3cfc5', fg: '#9a3f2b' },
  warn: { bg: '#fff1dc', border: '#f6dfbf', fg: '#8a4b12' },
  gain: { bg: '#e6f7f1', border: '#bfe9da', fg: '#0f6b3f' },
};

/** STOP-LOSS = loss, DRAWDOWN = warn, PRICE TARGET = gain; the rest follow the direction (down = warn, up = gain). */
export function alertTone(type: AlertEmailType, direction: Direction): AlertTone {
  if (type === 'STOP-LOSS') return 'loss';
  if (type === 'DRAWDOWN') return 'warn';
  if (type === 'PRICE TARGET') return 'gain';
  return direction === 'down' ? 'warn' : 'gain';
}

/** Real characters, not entities: the templates escape `{{value}}`, so an entity would print literally. */
export const ARROW: Record<Direction, string> = { down: '▼', up: '▲' };

export type IndexDir = 'gain' | 'loss' | 'neutral';

export const INDEX_COLOR: Record<IndexDir, string> = { gain: '#0b8266', loss: '#ba533c', neutral: '#16191c' };
