import { describe, expect, it } from 'vitest';
import type { Bar } from '@/lib/chart/bars';
import { rangePosition, resolveRange52 } from './range52';

const bar = (i: number, high: number, low: number): Bar => ({
  time: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
  open: low,
  high,
  low,
  close: high,
  volume: 1,
});

describe('resolveRange52', () => {
  it('prefers the live quote range', () => {
    expect(resolveRange52({ low: '720', high: '1100' }, [bar(0, 5, 1)])).toEqual({ low: 720, high: 1100 });
  });
  it('falls back to the last ~year of bars when the quote has no range', () => {
    const bars = Array.from({ length: 300 }, (_, i) => bar(i, 100 + (i === 299 ? 50 : 0), 90));
    // the first 48 bars fall outside the 252-bar window, so they cannot set the range
    bars[0] = bar(0, 9999, 1);
    expect(resolveRange52({ low: null, high: null }, bars)).toEqual({ low: 90, high: 150 });
  });
  it('ignores a nonsensical quote range (high <= low) and uses the bars', () => {
    const r = resolveRange52({ low: '500', high: '400' }, [bar(0, 120, 80), bar(1, 130, 85)]);
    expect(r).toEqual({ low: 80, high: 130 });
  });
  it('returns null with no usable data', () => {
    expect(resolveRange52({ low: null, high: null }, [])).toBeNull();
  });
});

describe('rangePosition', () => {
  const range = { low: 720, high: 1100 };
  it('places the price as a percentage of the range', () => {
    expect(rangePosition(910, range)).toMatchObject({ pct: 50 });
    expect(rangePosition(720, range)?.pct).toBe(0);
    expect(rangePosition(1100, range)?.pct).toBe(100);
  });
  it('clamps a price outside a stale range instead of overflowing the bar', () => {
    expect(rangePosition(1200, range)?.pct).toBe(100);
    expect(rangePosition(600, range)?.pct).toBe(0);
  });
  it('describes the position in neutral words', () => {
    expect(rangePosition(1090, range)?.label).toBe('Near its 52-week high');
    expect(rangePosition(725, range)?.label).toBe('Near its 52-week low');
    expect(rangePosition(910, range)?.label).toBe('Mid-range (50% of the way up)');
  });
  it('is null without a price or a range', () => {
    expect(rangePosition(null, range)).toBeNull();
    expect(rangePosition(100, null)).toBeNull();
  });
});
