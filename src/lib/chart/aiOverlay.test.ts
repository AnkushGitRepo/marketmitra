import { describe, expect, it } from 'vitest';
import type { Bar } from './bars';
import { buildOverlayPrompt, mapIndicator, parseOverlay } from './aiOverlay';

/** 60 daily bars from 2026-01-01, closing 100 → 159, each with a ±2 range. */
const bars: Bar[] = Array.from({ length: 60 }, (_, i) => {
  const close = 100 + i;
  return { time: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: close - 1, high: close + 2, low: close - 2, close, volume: 1000 };
});
const last = bars[bars.length - 1].close; // 159

const reply = (o: unknown) => JSON.stringify(o);

describe('mapIndicator', () => {
  it('maps common spellings onto chart indicators and rejects unknowns', () => {
    expect(mapIndicator('EMA_50')).toBe('ema50');
    expect(mapIndicator('SMA 200')).toBe('sma200');
    expect(mapIndicator('RSI_14')).toBe('rsi');
    expect(mapIndicator('bollinger_bands')).toBe('bb');
    expect(mapIndicator('MACD')).toBe('macd');
    expect(mapIndicator('EMA_200')).toBe('sma200');
    expect(mapIndicator('ichimoku')).toBeNull();
  });
});

describe('parseOverlay levels', () => {
  it('keeps at most two supports below and two resistances above price, nearest first, with code-made labels', () => {
    const o = parseOverlay(
      reply({
        levels: [
          { type: 'support', price: 150, label: 'BUY HERE' },
          { type: 'support', price: 140 },
          { type: 'support', price: 130 },
          { type: 'resistance', price: 170 },
          { type: 'resistance', price: 165 },
          { type: 'resistance', price: 180 },
        ],
      }),
      bars,
      'guarded'
    );
    expect(o?.levels.map((l) => `${l.label}:${l.price}`)).toEqual(['S1:150', 'S2:140', 'R1:165', 'R2:170']);
  });

  it('drops wrong-side, implausible and near-duplicate levels', () => {
    const o = parseOverlay(
      reply({
        levels: [
          { type: 'support', price: 170 }, // above price
          { type: 'resistance', price: 120 }, // below price
          { type: 'support', price: 5 }, // far outside the traded range
          { type: 'support', price: 150 },
          { type: 'support', price: 149.8 }, // within 0.5% of the nearer one
          { type: 'support', price: 'abc' },
        ],
      }),
      bars,
      'guarded'
    );
    expect(o?.levels).toEqual([{ kind: 'support', price: 150, label: 'S1' }]);
  });
});

describe('parseOverlay trendlines and indicators', () => {
  it('snaps trendline ends to real bars, keeps them in time order and drops degenerate ones', () => {
    const o = parseOverlay(
      reply({
        trendlines: [
          { startTime: '2026-01-10', startPrice: 109, endTime: '2026-02-20', endPrice: 150 },
          { startTime: '2026-02-20', startPrice: 150, endTime: '2026-01-10', endPrice: 109 }, // reversed: reordered
          { startTime: '2026-01-10', startPrice: 109, endTime: '2026-01-10', endPrice: 109 }, // zero length
          { startTime: 'garbage', startPrice: 1, endTime: '2026-02-01', endPrice: 2 },
        ],
      }),
      bars,
      'guarded'
    );
    expect(o?.trendlines).toHaveLength(2);
    for (const t of o?.trendlines ?? []) expect(t.a.time < t.b.time).toBe(true);
  });

  it('maps and de-duplicates recommended indicators', () => {
    const o = parseOverlay(reply({ indicators: ['EMA_50', 'ema50', 'SMA_200', 'ichimoku'] }), bars, 'guarded');
    expect(o?.indicators).toEqual(['ema50', 'sma200']);
  });
});

describe('parseOverlay trade setup', () => {
  const setup = { direction: 'LONG', entry: 160, stop: 150, target: 185 };

  it('never returns a setup in guarded mode, even when the model emitted one', () => {
    const o = parseOverlay(reply({ levels: [{ type: 'support', price: 150 }], setup }), bars, 'guarded');
    expect(o).not.toBeNull();
    expect(o?.setup).toBeUndefined();
  });

  it('computes risk/reward and percentages in code, ignoring the model\'s own ratio', () => {
    const o = parseOverlay(reply({ setup: { ...setup, stop: 151, risk_reward: '1:9' } }), bars, 'unrestricted');
    expect(o?.setup).toEqual({ direction: 'long', entry: 160, stop: 151, target: 185, riskReward: 2.8, stopPct: -5.6, targetPct: 15.6 });
  });

  it('supports a short setup', () => {
    const o = parseOverlay(reply({ setup: { direction: 'SHORT', entry: 158, stop: 166, target: 140 } }), bars, 'unrestricted');
    expect(o?.setup).toMatchObject({ direction: 'short', riskReward: 2.3 });
  });

  it.each([
    ['stop above entry for a long', { direction: 'LONG', entry: 160, stop: 165, target: 185 }],
    ['target below entry for a long', { direction: 'LONG', entry: 160, stop: 150, target: 155 }],
    ['entry far from the current price', { direction: 'LONG', entry: 220, stop: 200, target: 260 }],
    ['a stop wider than 25%', { direction: 'LONG', entry: 160, stop: 100, target: 400 }],
    ['an unknown direction', { direction: 'HOLD', entry: 160, stop: 150, target: 185 }],
  ])('drops a setup with %s', (_name, bad) => {
    expect(parseOverlay(reply({ setup: bad }), bars, 'unrestricted')?.setup).toBeUndefined();
  });
});

describe('parseOverlay input handling', () => {
  it('reads JSON inside a fence or surrounded by text', () => {
    const o = parseOverlay('Here you go:\n```json\n{"levels":[{"type":"support","price":150}]}\n```', bars, 'guarded');
    expect(o?.levels).toHaveLength(1);
  });

  it('returns null for unreadable output, and for output with nothing usable on it', () => {
    expect(parseOverlay('no json here', bars, 'guarded')).toBeNull();
    expect(parseOverlay(reply({ levels: [{ type: 'support', price: 999 }] }), bars, 'guarded')).toBeNull();
    expect(parseOverlay(reply({}), [], 'guarded')).toBeNull();
  });
});

describe('buildOverlayPrompt', () => {
  it('lists only the most recent bars and states the last close', () => {
    const p = buildOverlayPrompt('ACC', bars, 10);
    expect(p).toContain('ACC');
    expect(p).toContain(`Last close: ${last}`);
    expect(p.split('\n').filter((l) => /^\d{4}-\d{2}-\d{2},/.test(l))).toHaveLength(10);
  });
});
