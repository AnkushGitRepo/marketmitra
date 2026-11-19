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
  // `bars` rise 100 → 159 (last close 159, ATR about 1.2). Model prices are ignored: the planner works from the levels.
  const modelSetup = { direction: 'LONG', entry: 1, stop: 2, target: 3, risk_reward: '1:9' };
  const levels = [
    { type: 'support', price: 152 },
    { type: 'resistance', price: 172 },
  ];

  it('never returns a setup or a note in guarded mode, even when the model emitted one', () => {
    const o = parseOverlay(reply({ levels, setup: modelSetup, bias: 'long' }), bars, 'guarded');
    expect(o).not.toBeNull();
    expect(o?.setup).toBeUndefined();
    expect(o?.setupNote).toBeUndefined();
  });

  it("plans the entry at the support, the stop beyond it and the target at resistance, ignoring the model's prices", () => {
    const o = parseOverlay(reply({ levels, setup: modelSetup }), bars, 'unrestricted');
    const s = o?.setup;
    expect(s).toBeDefined();
    expect(s?.direction).toBe('long');
    expect(s?.entryType).toBe('pullback');
    expect(s?.entry).toBeGreaterThan(152);
    expect(s?.entry).toBeLessThan(153);
    expect(s?.stop).toBeLessThan(152);
    expect(s?.target).toBe(172);
    expect(s?.riskReward).toBeGreaterThanOrEqual(1.5);
    expect(s?.lastClose).toBe(159);
  });

  it("follows the model's lean when the trend does not decide and both sides work", () => {
    const flatBars: Bar[] = bars.map((b, i) => ({
      ...b,
      open: 150,
      high: 150.2,
      low: 149.8,
      close: 150,
      time: b.time + (i ? '' : ''),
    }));
    const both = [
      { type: 'support', price: 148.5 },
      { type: 'resistance', price: 151.5 },
    ];
    const o = parseOverlay(reply({ levels: both, bias: 'short' }), flatBars, 'unrestricted');
    expect(o?.setup?.direction).toBe('short');
  });

  it('gives a plain reason instead of a setup when nothing pays enough', () => {
    const tight = [
      { type: 'support', price: 158.5 },
      { type: 'resistance', price: 159.4 },
    ];
    const o = parseOverlay(reply({ levels: tight }), bars, 'unrestricted');
    expect(o?.setup).toBeUndefined();
    expect(o?.setupNote).toMatch(/1\.5/);
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

  it('plans on the timeframe: a support 5.7% away is too far for a 5m limit order but fine on Day', () => {
    const far = [
      { type: 'support', price: 150 },
      { type: 'resistance', price: 175 },
    ];
    expect(
      parseOverlay(reply({ levels: far }), intraday, 'unrestricted', '5m')?.setup,
    ).toBeUndefined();
    expect(parseOverlay(reply({ levels: far }), bars, 'unrestricted', '1d')?.setup).toBeDefined();
  });
});
