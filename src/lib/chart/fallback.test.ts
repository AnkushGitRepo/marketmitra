import { describe, expect, it } from 'vitest';
import type { Bar } from './bars';
import { MIN_HEALTHY_HEIGHT_PX, buildLineChart, downsample, hasVisibleInk, shouldUseFallback } from './fallback';

const bar = (i: number, close: number): Bar => ({ time: `2026-01-${String(i + 1).padStart(2, '0')}`, open: close, high: close, low: close, close, volume: 0 });
const series = (closes: number[]) => closes.map((c, i) => bar(i, c));

describe('shouldUseFallback', () => {
  it('falls back on an error', () => expect(shouldUseFallback({ errored: true, measuredHeight: 420 })).toBe(true));

  it('falls back when the chart measured as collapsed (the iPhone case)', () => {
    expect(shouldUseFallback({ errored: false, measuredHeight: 0 })).toBe(true);
    expect(shouldUseFallback({ errored: false, measuredHeight: MIN_HEALTHY_HEIGHT_PX - 1 })).toBe(true);
  });

  it('keeps the interactive chart when healthy or when height cannot be measured', () => {
    expect(shouldUseFallback({ errored: false, measuredHeight: MIN_HEALTHY_HEIGHT_PX })).toBe(false);
    expect(shouldUseFallback({ errored: false, measuredHeight: 420 })).toBe(false);
    expect(shouldUseFallback({ errored: false, measuredHeight: null })).toBe(false);
  });
});

describe('downsample', () => {
  it('leaves short series alone and thins long ones, keeping first and last', () => {
    expect(downsample([1, 2, 3], 10)).toEqual([1, 2, 3]);
    const long = Array.from({ length: 1000 }, (_, i) => i);
    const out = downsample(long, 100);
    expect(out).toHaveLength(100);
    expect(out[0]).toBe(0);
    expect(out[99]).toBe(999);
  });

  it('does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5];
    downsample(input, 2);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('buildLineChart', () => {
  it('maps the lowest close to the bottom and the highest to the top of the padded box', () => {
    const g = buildLineChart(series([10, 20, 15]), 100, 50, 5)!;
    expect(g.min).toBe(10);
    expect(g.max).toBe(20);
    expect(g.first).toBe(10);
    expect(g.last).toBe(15);
    expect(g.path.startsWith('M5.0,45.0')).toBe(true); // first point: left pad, lowest value -> bottom
    expect(g.path).toContain('50.0,5.0'); // middle point is the max -> top, centred horizontally
    expect(g.areaPath.endsWith('Z')).toBe(true);
  });

  it('draws a flat series as a mid-height line, never NaN', () => {
    const g = buildLineChart(series([7, 7, 7]), 100, 40, 4)!;
    expect(g.path).not.toMatch(/NaN|Infinity/);
    expect(g.path).toContain(',20.0');
  });

  it('returns null when there is nothing meaningful to draw', () => {
    expect(buildLineChart([], 100, 50)).toBeNull();
    expect(buildLineChart(series([5]), 100, 50)).toBeNull();
    expect(buildLineChart(series([5, 6]), 10, 50, 8)).toBeNull(); // box too small for the padding
  });

  it('ignores non-finite closes', () => {
    const g = buildLineChart([bar(0, 1), bar(1, NaN), bar(2, 3)], 100, 50)!;
    expect(g.points).toBe(2);
    expect(g.path).not.toContain('NaN');
  });

  it('keeps a 5-year series small enough to be cheap', () => {
    const g = buildLineChart(series(Array.from({ length: 1300 }, (_, i) => 100 + (i % 17))), 600, 300)!;
    expect(g.points).toBeLessThanOrEqual(320);
    expect(g.path.length).toBeLessThan(6000);
  });
});

describe('hasVisibleInk', () => {
  const blank = (pixels: number) => new Uint8ClampedArray(pixels * 4);

  it('is false for a fully transparent canvas (the chart drew nothing)', () => {
    expect(hasVisibleInk(blank(10_000))).toBe(false);
    expect(hasVisibleInk(blank(0))).toBe(false);
  });

  it('is true as soon as a sampled pixel has any alpha', () => {
    const data = blank(10_000);
    data[16 * 4 * 5 + 3] = 255; // the 80th pixel: lands on the sampling grid
    expect(hasVisibleInk(data, 16)).toBe(true);
  });

  it('samples sparsely but still finds ink painted across a line', () => {
    const data = blank(1000);
    for (let i = 200; i < 260; i++) data[i * 4 + 3] = 255; // a 60px-wide stroke is wider than the 16px step
    expect(hasVisibleInk(data, 16)).toBe(true);
  });

  it('treats a step below 1 as 1 (checks every pixel)', () => {
    const data = blank(50);
    data[7 * 4 + 3] = 1;
    expect(hasVisibleInk(data, 0)).toBe(true);
  });
});
