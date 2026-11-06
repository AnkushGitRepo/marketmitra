import { describe, expect, it } from 'vitest';
import { bollinger, ema, macd, rsi, sma } from './indicators';

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
  it("weights recent values more than an SMA does", () => {
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
