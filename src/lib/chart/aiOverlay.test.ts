import { describe, expect, it } from 'vitest';
import type { Bar } from './bars';
import { buildOverlayPrompt, mapIndicator, parseOverlay } from './aiOverlay';
import { toBarTime } from './timeframes';

/** 60 daily bars from 2026-01-01, closing 100 → 159, each with a ±2 range. */
const bars: Bar[] = Array.from({ length: 60 }, (_, i) => {
  const close = 100 + i;
  return {
    time: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1000,
  };
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
      'guarded',
    );
    expect(o?.levels.map((l) => `${l.label}:${l.price}`)).toEqual([
      'S1:150',
      'S2:140',
      'R1:165',
      'R2:170',
    ]);
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
      'guarded',
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
      'guarded',
    );
    expect(o?.trendlines).toHaveLength(2);
    for (const t of o?.trendlines ?? []) expect(t.a.time < t.b.time).toBe(true);
  });

  it('maps and de-duplicates recommended indicators', () => {
    const o = parseOverlay(
      reply({ indicators: ['EMA_50', 'ema50', 'SMA_200', 'ichimoku'] }),
      bars,
      'guarded',
    );
    expect(o?.indicators).toEqual(['ema50', 'sma200']);
  });
});

describe('parseOverlay trade setup', () => {
  const setup = { direction: 'LONG', entry: 160, stop: 150, target: 185 };

  it('never returns a setup in guarded mode, even when the model emitted one', () => {
    const o = parseOverlay(
      reply({ levels: [{ type: 'support', price: 150 }], setup }),
      bars,
      'guarded',
    );
    expect(o).not.toBeNull();
    expect(o?.setup).toBeUndefined();
  });

  it("computes risk/reward and percentages in code, ignoring the model's own ratio", () => {
    const o = parseOverlay(
      reply({ setup: { ...setup, stop: 151, risk_reward: '1:9' } }),
      bars,
      'unrestricted',
    );
    expect(o?.setup).toEqual({
      direction: 'long',
      entry: 160,
      stop: 151,
      target: 185,
      riskReward: 2.8,
      stopPct: -5.6,
      targetPct: 15.6,
    });
  });

  it('supports a short setup', () => {
    const o = parseOverlay(
      reply({ setup: { direction: 'SHORT', entry: 158, stop: 166, target: 140 } }),
      bars,
      'unrestricted',
    );
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
    const o = parseOverlay(
      'Here you go:\n```json\n{"levels":[{"type":"support","price":150}]}\n```',
      bars,
      'guarded',
    );
    expect(o?.levels).toHaveLength(1);
  });

  it('returns null for unreadable output, and for output with nothing usable on it', () => {
    expect(parseOverlay('no json here', bars, 'guarded')).toBeNull();
    expect(
      parseOverlay(reply({ levels: [{ type: 'support', price: 999 }] }), bars, 'guarded'),
    ).toBeNull();
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

describe('intraday timeframes', () => {
  // 60 five-minute bars from 09:15 IST on 2026-11-18, closing 100 → 159.
  const start = Date.UTC(2026, 10, 18, 3, 45) / 1000;
  const intraday: Bar[] = Array.from({ length: 60 }, (_, i) => {
    const close = 100 + i;
    return {
      time: toBarTime(start + i * 300),
      open: close - 1,
      high: close + 0.2,
      low: close - 0.2,
      close,
      volume: 10,
    };
  });

  it('writes bar times in the prompt as IST date and time, and says which timeframe it is', () => {
    const p = buildOverlayPrompt('ACC', intraday, 3, '5m');
    expect(p).toContain('5m candles, times in IST');
    expect(p).toContain('2026-11-18 14:10,'); // the last bar: 09:15 + 59 * 5 min
    expect(p).not.toContain('2026-11-18 13:55,'); // only the last 3 are listed
  });

  it('reads an intraday trendline written as `date hh:mm` and snaps it to a real bar', () => {
    const o = parseOverlay(
      reply({
        trendlines: [
          {
            startTime: '2026-11-18 09:20',
            startPrice: 101,
            endTime: '2026-11-18 13:50',
            endPrice: 155,
          },
        ],
      }),
      intraday,
      'guarded',
      '5m',
    );
    expect(o?.trendlines).toHaveLength(1);
    expect(o?.trendlines[0].a.time).toBe(intraday[1].time);
    expect(o?.trendlines[0].b.time).toBe(intraday[55].time);
  });

  it('keeps levels close together on a short timeframe that Day would merge', () => {
    // 0.3% apart: one level on Day (0.5% rule), two on 5m (0.1% rule)
    const levels = [
      { type: 'support', price: 150 },
      { type: 'support', price: 149.55 },
    ];
    expect(parseOverlay(reply({ levels }), bars, 'guarded', '1d')?.levels).toHaveLength(1);
    expect(parseOverlay(reply({ levels }), intraday, 'guarded', '5m')?.levels).toHaveLength(2);
  });

  it('holds a trade setup to a tighter stop than Day: a 5.7% stop is too wide for 5m', () => {
    const wide = { direction: 'LONG', entry: 159, stop: 150, target: 175 };
    expect(
      parseOverlay(
        reply({ levels: [{ type: 'support', price: 150 }], setup: wide }),
        intraday,
        'unrestricted',
        '5m',
      )?.setup,
    ).toBeUndefined();
    expect(
      parseOverlay(
        reply({ levels: [{ type: 'support', price: 150 }], setup: wide }),
        bars,
        'unrestricted',
        '1d',
      )?.setup,
    ).toBeDefined();
  });
});
