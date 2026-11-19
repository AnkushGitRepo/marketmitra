import { describe, expect, it } from 'vitest';
import {
  atr,
  bollinger,
  donchian,
  ema,
  macd,
  obv,
  rsi,
  sma,
  stochastic,
  supertrend,
} from './indicators';

describe('sma', () => {
  it('is null until a full window exists, then the rolling mean', () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('returns all nulls when the series is shorter than the window', () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });
});

describe('ema', () => {
  it('seeds with the SMA and then applies the 2/(n+1) multiplier', () => {
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
  });
  it('weights recent values more than an SMA does', () => {
    expect(ema([10, 10, 10, 10, 20], 3)[4]).toBe(15); // 20*0.5 + 10*0.5
  });
});

describe('bollinger', () => {
  it('uses population standard deviation around the SMA', () => {
    const { mid, upper, lower } = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(mid[7]).toBe(5);
    expect(upper[7]).toBe(9);
    expect(lower[7]).toBe(1);
    expect(mid[6]).toBeNull();
  });
});

describe('rsi', () => {
  it('is 100 for a strictly rising series and 0 for a strictly falling one', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3).at(-1)).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 3).at(-1)).toBe(0);
  });
  it('applies Wilder smoothing', () => {
    expect(rsi([1, 2, 1, 2, 1], 2)).toEqual([null, null, 50, 75, 37.5]);
  });
});

describe('macd', () => {
  it('starts the line at slow-1 and the signal signalPeriod-1 later', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const { line, signal, histogram } = macd(closes, 12, 26, 9);
    expect(line.findIndex((v) => v !== null)).toBe(25);
    expect(signal.findIndex((v) => v !== null)).toBe(33);
    expect(histogram[40]).toBeCloseTo(line[40]! - signal[40]!, 10);
  });
  it('is flat zero for a constant series', () => {
    const { line } = macd(Array(40).fill(50), 12, 26, 9);
    expect(line.at(-1)).toBe(0);
  });
});

describe('atr', () => {
  it('is null until the first full window, seeded with the mean true range, then Wilder-smoothed', () => {
    const high = [10, 12, 11, 13];
    const low = [8, 9, 9, 10];
    const close = [9, 11, 10, 12];
    // true ranges from bar 1: max(3, |12-9|, |9-9|)=3, max(2, 1, 1)=2, max(3, 3, 0)=3
    const out = atr(high, low, close, 3);
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).toBeCloseTo((3 + 2 + 3) / 3, 10);
  });
});

describe('stochastic', () => {
  it('puts %K at 100 when the close is the highest high of the window and %D is its mean', () => {
    const high = [1, 2, 3, 4, 5, 6];
    const low = [0, 1, 2, 3, 4, 5];
    const close = [1, 2, 3, 4, 5, 6];
    const { k, d } = stochastic(high, low, close, 3, 1, 2);
    expect(k[2]).toBe((100 * (3 - 0)) / (3 - 0));
    expect(k.slice(0, 2)).toEqual([null, null]);
    expect(d[3]).toBeCloseTo(((k[2] as number) + (k[3] as number)) / 2, 10);
  });
  it('returns 50 when the window is flat instead of dividing by zero', () => {
    const flat = [5, 5, 5, 5];
    expect(stochastic(flat, flat, flat, 3, 1, 1).k[3]).toBe(50);
  });
});

describe('obv', () => {
  it('adds volume on up closes, subtracts on down closes, and holds on flat closes', () => {
    expect(obv([10, 11, 10, 10, 12], [100, 50, 30, 20, 40])).toEqual([0, 50, 20, 20, 60]);
  });
});

describe('donchian', () => {
  it('is the rolling highest high, lowest low and their midpoint', () => {
    const { upper, lower, mid } = donchian([5, 7, 6, 9], [3, 4, 2, 5], 2);
    expect(upper).toEqual([null, 7, 7, 9]);
    expect(lower).toEqual([null, 3, 2, 2]);
    expect(mid).toEqual([null, 5, 4.5, 5.5]);
  });
});

describe('supertrend', () => {
  it('trends up (line below price) in a steady rise and down (line above price) in a steady fall', () => {
    const rise = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const up = supertrend(
      rise.map((v) => v + 1),
      rise.map((v) => v - 1),
      rise,
      10,
      3,
    );
    expect(up.up[29]).toBe(true);
    expect(up.line[29] as number).toBeLessThan(rise[29]);
    const fall = rise.slice().reverse();
    const down = supertrend(
      fall.map((v) => v + 1),
      fall.map((v) => v - 1),
      fall,
      10,
      3,
    );
    expect(down.up[29]).toBe(false);
    expect(down.line[29] as number).toBeGreaterThan(fall[29]);
  });
  it('is null before the ATR exists', () => {
    const v = [1, 2, 3];
    expect(supertrend(v, v, v, 10, 3).line).toEqual([null, null, null]);
  });
});
