import { describe, expect, it } from 'vitest';
import type { Bar } from './bars';
import { planSetup, swingLevels } from './setupPlanner';

/** `closes` as daily bars, each ±0.2 around the close, so ATR(14) is about 1.2 in a steady move of 1 a bar. */
const barsFrom = (closes: number[]): Bar[] =>
  closes.map((close, i) => ({
    time: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
    open: close,
    high: close + 0.2,
    low: close - 0.2,
    close,
    volume: 10,
  }));
const rising = barsFrom(Array.from({ length: 80 }, (_, i) => 100 + i)); // last close 179
const falling = barsFrom(Array.from({ length: 80 }, (_, i) => 200 - i)); // last close 121
const flat = barsFrom(Array.from({ length: 80 }, () => 150));

describe('planSetup: long', () => {
  it('waits for a pullback to support when price is not at it, with the stop beyond the level and the target at resistance', () => {
    const r = planSetup({ bars: rising, supports: [170], resistances: [190], timeframe: '1d' });
    expect(r.setup).not.toBeNull();
    const s = r.setup!;
    expect(s.direction).toBe('long');
    expect(s.entryType).toBe('pullback');
    expect(s.entry).toBeGreaterThan(170);
    expect(s.entry).toBeLessThan(171);
    expect(s.stop).toBeLessThan(170);
    expect(s.target).toBe(190);
    expect(s.riskReward).toBeGreaterThanOrEqual(1.5);
  });

  it('enters at the current price when it already sits at the support', () => {
    const r = planSetup({ bars: rising, supports: [178.5], resistances: [190], timeframe: '1d' });
    expect(r.setup?.entryType).toBe('now');
    expect(r.setup?.entry).toBe(179);
  });

  it('skips a target that does not pay enough and uses the next one', () => {
    const r = planSetup({
      bars: rising,
      supports: [178.5],
      resistances: [179.8, 195],
      timeframe: '1d',
    });
    expect(r.setup?.target).toBe(195);
  });
});

describe('planSetup: short', () => {
  it('waits for a retest of resistance in a downtrend, stop above it, target at support', () => {
    const r = planSetup({ bars: falling, supports: [110], resistances: [124], timeframe: '1d' });
    const s = r.setup!;
    expect(s.direction).toBe('short');
    expect(s.entryType).toBe('retest');
    expect(s.entry).toBeLessThan(124);
    expect(s.entry).toBeGreaterThan(123);
    expect(s.stop).toBeGreaterThan(124);
    expect(s.target).toBe(110);
  });
});

describe('planSetup: no setup', () => {
  it('declines when no target gives at least 1.5 : 1, and says what price needs to do', () => {
    const r = planSetup({ bars: rising, supports: [178.5], resistances: [179.6], timeframe: '1d' });
    expect(r.setup).toBeNull();
    expect(r.reason).toMatch(/1\.5/);
  });
  it('declines without any level to plan around', () => {
    const r = planSetup({ bars: rising, supports: [], resistances: [], timeframe: '1d' });
    expect(r.setup).toBeNull();
  });
  it('declines when the stop would be wider than the timeframe allows', () => {
    // support 40% below: a Day stop may be at most 25% wide
    const r = planSetup({ bars: rising, supports: [110], resistances: [200], timeframe: '1d' });
    expect(r.setup).toBeNull();
  });
});

describe('planSetup: direction', () => {
  it('prefers the side the trend favours when both are valid', () => {
    const up = planSetup({ bars: rising, supports: [170], resistances: [182], timeframe: '1d' });
    expect(up.setup?.direction).toBe('long');
    const down = planSetup({ bars: falling, supports: [110], resistances: [124], timeframe: '1d' });
    expect(down.setup?.direction).toBe('short');
  });
  it("with no trend, follows the model's bias, else the better reward", () => {
    const levels = { supports: [149], resistances: [151.5], timeframe: '1d' as const };
    expect(planSetup({ bars: flat, ...levels, bias: 'short' }).setup?.direction).toBe('short');
  });
});

describe('swingLevels', () => {
  it('finds the pivot highs and lows that price turned at, clustered', () => {
    const closes = [
      10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 11, 12,
      13, 14, 15, 14, 13, 12,
    ];
    const { supports, resistances } = swingLevels(barsFrom(closes), 3);
    expect(resistances.some((p) => Math.abs(p - 15.2) < 0.5)).toBe(true);
    expect(supports.some((p) => Math.abs(p - 9.8) < 0.5)).toBe(true);
  });
});
