import { describe, expect, it } from 'vitest';
import type { RangeSeries } from './chartMath';
import { alertSeverity, selectCriticalAlerts, type AlertLike } from './criticalAlerts';
import { computeHero, formatSignedAmount, formatSignedPct } from './heroMetrics';
import { HERO_RANGES, WEEK_POINTS, lastPoints, seriesForRange } from './heroRanges';
import { orderIndices } from './indexOrder';
import type { IndexQuoteOut, PricePeriod } from './fundamentalsApi';

describe('computeHero', () => {
  it('measures today against yesterday’s value, and total return against what was invested', () => {
    const h = computeHero({ totalValue: 52_072, invested: 40_990, todayChange: 773 });
    expect(h.today.amount).toBe(773);
    expect(h.today.pct).toBeCloseTo((773 / (52_072 - 773)) * 100, 6); // ≈ 1.507%, not 773/52072
    expect(h.total.amount).toBe(11_082);
    expect(h.total.pct).toBeCloseTo(27.036, 2);
    expect(h.today.tone).toBe('gain');
    expect(h.total.tone).toBe('gain');
  });

  it('flags losses and handles nothing-to-compare without NaN or Infinity', () => {
    const loss = computeHero({ totalValue: 900, invested: 1000, todayChange: -50 });
    expect(loss.today.tone).toBe('loss');
    expect(loss.total.tone).toBe('loss');
    expect(loss.total.pct).toBeCloseTo(-10, 6);
    const none = computeHero({ totalValue: 0, invested: 0, todayChange: 0 });
    expect(none.today.pct).toBeNull();
    expect(none.total.pct).toBeNull();
    expect(none.today.tone).toBe('flat');
  });
});

describe('formatSignedPct / formatSignedAmount', () => {
  it('signs percentages, rounds, and never shows "-0.0%"', () => {
    expect(formatSignedPct(1.507)).toBe('+1.5%');
    expect(formatSignedPct(-0.84)).toBe('-0.8%');
    expect(formatSignedPct(-0.01)).toBe('0.0%');
    expect(formatSignedPct(0)).toBe('0.0%');
    expect(formatSignedPct(null)).toBe('—');
    expect(formatSignedPct(Number.NaN)).toBe('—');
  });

  it('puts a plus on gains only, using the supplied formatter', () => {
    const fmt = (n: number) => (n < 0 ? `-₹${Math.abs(n)}` : `₹${n}`);
    expect(formatSignedAmount(773, fmt)).toBe('+₹773');
    expect(formatSignedAmount(-1200, fmt)).toBe('-₹1200');
    expect(formatSignedAmount(0, fmt)).toBe('₹0');
  });
});

describe('hero ranges', () => {
  const series = (n: number): RangeSeries => ({ v: Array.from({ length: n }, (_, i) => i), l: Array.from({ length: n }, (_, i) => `d${i}`) });
  const history = { '1mo': series(20), '6mo': series(120), '1y': series(250), '5y': series(1200) } as Record<PricePeriod, RangeSeries>;

  it('offers 1W, 1M, 1Y and 5Y (no 1D: there is no intraday data)', () => {
    expect(HERO_RANGES).toEqual(['1w', '1mo', '1y', '5y']);
  });

  it('derives 1W from the last points of the month series and passes the others through', () => {
    const week = seriesForRange(history, '1w');
    expect(week.v).toHaveLength(WEEK_POINTS);
    expect(week.v.at(-1)).toBe(19);
    expect(week.l).toHaveLength(WEEK_POINTS);
    expect(seriesForRange(history, '1y')).toBe(history['1y']);
  });

  it('copes with a short or empty series, and does not mutate its input', () => {
    expect(lastPoints(series(3), 6).v).toEqual([0, 1, 2]);
    expect(lastPoints(series(0), 6)).toEqual({ v: [], l: [] });
    expect(lastPoints(series(5), 0)).toEqual({ v: [], l: [] });
    const s = series(10);
    lastPoints(s, 3);
    expect(s.v).toHaveLength(10);
  });
});

const ix = (name: string): IndexQuoteOut => ({ name, value: '1', change: '0', change_pct: '0', spark: [] });

describe('orderIndices', () => {
  it('puts NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX in that order whatever order the API sent', () => {
    const out = orderIndices([ix('INDIA VIX'), ix('NIFTY BANK'), ix('SENSEX'), ix('NIFTY 50')]);
    expect(out.map((i) => i.name)).toEqual(['NIFTY 50', 'SENSEX', 'NIFTY BANK', 'INDIA VIX']);
  });

  it('is case/spacing tolerant, keeps others after the four, and caps at four', () => {
    const out = orderIndices([ix('nifty  it'), ix('sensex'), ix('Nifty 50'), ix('INDIA VIX'), ix('NIFTY BANK')]);
    expect(out.map((i) => i.name)).toEqual(['Nifty 50', 'sensex', 'NIFTY BANK', 'INDIA VIX']);
    expect(orderIndices([ix('A'), ix('B'), ix('C'), ix('D'), ix('E')]).map((i) => i.name)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('shows fewer when fewer exist and does not mutate its input', () => {
    const input = [ix('SENSEX'), ix('NIFTY 50')];
    expect(orderIndices(input).map((i) => i.name)).toEqual(['NIFTY 50', 'SENSEX']);
    expect(input.map((i) => i.name)).toEqual(['SENSEX', 'NIFTY 50']);
    expect(orderIndices([])).toEqual([]);
  });
});

describe('alerts', () => {
  const NOW = new Date('2026-11-10T12:00:00Z');
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
  const alert = (id: string, alertType: string, title: string, over: Partial<AlertLike> = {}): AlertLike => ({
    id, kind: 'alert', title, read: false, createdAt: hoursAgo(2), meta: { alertType }, ...over,
  });

  it('treats stop-loss and drawdown as critical, price targets as warnings, and a price alert that fell as critical', () => {
    expect(alertSeverity(alert('1', 'trailing_stop', 'TCS hit its trailing stop'))).toBe('critical');
    expect(alertSeverity(alert('2', 'cumulative_drawdown', 'X down 12%'))).toBe('critical');
    expect(alertSeverity(alert('3', 'price_threshold', 'INFY rose to ₹1,500'))).toBe('warning');
    expect(alertSeverity(alert('4', 'price_threshold', 'INFY fell to ₹1,100'))).toBe('critical');
    expect(alertSeverity(alert('5', 'week52_breach', 'near its 52-week high'))).toBe('warning');
  });

  it('selects recent alerts only: unread first, then newest, max three, system notices excluded', () => {
    const items = [
      alert('old', 'trailing_stop', 'old', { createdAt: hoursAgo(24 * 9) }),
      alert('read-new', 'trailing_stop', 'a', { read: true, createdAt: hoursAgo(1) }),
      alert('unread-old', 'trailing_stop', 'b', { createdAt: hoursAgo(50) }),
      alert('unread-new', 'price_threshold', 'c', { createdAt: hoursAgo(3) }),
      { ...alert('sys', 'x', 'system'), kind: 'system' },
      alert('extra', 'trailing_stop', 'd', { read: true, createdAt: hoursAgo(100) }),
    ];
    expect(selectCriticalAlerts(items, NOW).map((i) => i.id)).toEqual(['unread-new', 'unread-old', 'read-new']);
  });

  it('returns nothing when there are no alerts, and does not mutate its input', () => {
    expect(selectCriticalAlerts([], NOW)).toEqual([]);
    const input = [alert('a', 'trailing_stop', 'x', { read: true }), alert('b', 'trailing_stop', 'y')];
    selectCriticalAlerts(input, NOW);
    expect(input.map((i) => i.id)).toEqual(['a', 'b']);
  });
});
