import { describe, expect, it } from 'vitest';
import { areaPath, compactInr, nearestIndex, niceTicks, plotPoints, seriesStats, smoothPath, visibleTicks, yFor } from './chartGeometry';

const PAD = { top: 10, right: 10, bottom: 20, left: 40 };

describe('seriesStats', () => {
  it('finds the high, the low and the change', () => {
    const s = seriesStats([100, 130, 90, 120]);
    expect(s).toMatchObject({ first: 100, last: 120, change: 20, changePct: 20 });
    expect(s?.high).toEqual({ index: 1, value: 130 });
    expect(s?.low).toEqual({ index: 2, value: 90 });
  });
  it('takes the first of a tie', () => expect(seriesStats([5, 9, 9, 1, 1])).toMatchObject({ high: { index: 1 }, low: { index: 3 } }));
  it('has no percent from a zero start, and no stats for nothing', () => {
    expect(seriesStats([0, 10])?.changePct).toBeNull();
    expect(seriesStats([])).toBeNull();
  });
  it('handles one value', () => expect(seriesStats([7])).toMatchObject({ change: 0, changePct: 0 }));
});

describe('niceTicks', () => {
  it('returns round values inside the range', () => {
    const t = niceTicks(54_100, 56_900, 4);
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(t.every((v) => v >= 54_100 && v <= 56_900)).toBe(true);
    const step = t[1] - t[0];
    expect(t.every((v, i) => i === 0 || Math.abs(v - t[i - 1] - step) < 1e-6)).toBe(true);
    expect([100, 200, 250, 500, 1000, 2000, 2500, 5000].some((s) => step % s === 0)).toBe(true);
  });
  it('gives one tick for a flat range and none for bad input', () => {
    expect(niceTicks(5, 5)).toEqual([5]);
    expect(niceTicks(NaN, 5)).toEqual([]);
  });
});

describe('plotPoints / yFor', () => {
  it('maps the highest value to the top and the lowest to the bottom of the inner box', () => {
    const pts = plotPoints([10, 30, 20], ['a', 'b', 'c'], 300, 100, PAD);
    expect(pts[1].y).toBe(PAD.top);
    expect(pts[0].y).toBe(100 - PAD.bottom);
    expect(pts[0].x).toBe(PAD.left);
    expect(pts[2].x).toBe(300 - PAD.right);
    expect(pts[1].label).toBe('b');
  });
  it('centres a flat series and a single point', () => {
    const flat = plotPoints([5, 5, 5], [], 300, 100, PAD);
    expect(new Set(flat.map((p) => p.y)).size).toBe(1);
    expect(flat[0].y).toBeGreaterThan(PAD.top);
    expect(plotPoints([5], [], 300, 100, PAD)[0].x).toBe(PAD.left + (300 - PAD.left - PAD.right) / 2);
  });
  it('puts an arbitrary value on the same scale', () => {
    const vals = [10, 30];
    expect(yFor(30, vals, 100, PAD)).toBe(PAD.top);
    expect(yFor(10, vals, 100, PAD)).toBe(100 - PAD.bottom);
    expect(yFor(20, vals, 100, PAD)).toBeCloseTo((PAD.top + 100 - PAD.bottom) / 2);
  });
  it('is empty for no values', () => expect(plotPoints([], [], 300, 100, PAD)).toEqual([]));
});

describe('smoothPath', () => {
  const pts = plotPoints([10, 40, 20, 50, 30], [], 400, 120, PAD);
  it('starts at the first point, ends at the last and has a curve per gap', () => {
    const d = smoothPath(pts);
    expect(d.startsWith(`M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`)).toBe(true);
    expect(d.endsWith(`${pts[4].x.toFixed(1)} ${pts[4].y.toFixed(1)}`)).toBe(true);
    expect((d.match(/C/g) ?? []).length).toBe(4);
  });
  it('never leaves the vertical range of the data', () => {
    // Numbers in the path alternate x, y; the y values must stay inside the plotted points' range.
    const numbers = [...smoothPath(pts).matchAll(/-?\d+\.\d+/g)].map((m) => Number(m[0]));
    const ys = numbers.filter((_, i) => i % 2 === 1);
    expect(ys.length).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(Math.min(...pts.map((p) => p.y)) - 0.1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(Math.max(...pts.map((p) => p.y)) + 0.1);
  });
  it('handles one, two and no points', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath(pts.slice(0, 1))).toMatch(/^M/);
    expect(smoothPath(pts.slice(0, 2))).toMatch(/^M.* L/);
  });
});

describe('areaPath', () => {
  it('closes the line down to the baseline', () => {
    const pts = plotPoints([1, 2], [], 100, 50, PAD);
    expect(areaPath('M0 0 L1 1', pts, 30)).toMatch(/Z$/);
    expect(areaPath('', pts, 30)).toBe('');
  });
});

describe('nearestIndex', () => {
  it('snaps the pointer to the closest point and clamps at the ends', () => {
    expect(nearestIndex(PAD.left, 5, 300, PAD)).toBe(0);
    expect(nearestIndex(300 - PAD.right, 5, 300, PAD)).toBe(4);
    expect(nearestIndex(-50, 5, 300, PAD)).toBe(0);
    expect(nearestIndex(9999, 5, 300, PAD)).toBe(4);
    expect(nearestIndex(PAD.left + (300 - PAD.left - PAD.right) / 2, 5, 300, PAD)).toBe(2);
  });
  it('is zero for one or no points', () => {
    expect(nearestIndex(100, 1, 300, PAD)).toBe(0);
    expect(nearestIndex(100, 0, 300, PAD)).toBe(0);
  });
});

describe('compactInr', () => {
  it('uses Indian short units', () => {
    expect(compactInr(54_835)).toBe('₹54.8k');
    expect(compactInr(120_000)).toBe('₹1.2L');
    expect(compactInr(34_000_000)).toBe('₹3.4Cr');
    expect(compactInr(950)).toBe('₹950');
    expect(compactInr(-2_500)).toBe('-₹2.5k');
    expect(compactInr(10_000)).toBe('₹10k');
  });
});

describe('visibleTicks', () => {
  const labelled = (labels: string[]) => plotPoints(labels.map((_, i) => i), labels, 400, 100, { top: 0, right: 0, bottom: 0, left: 0 });
  it('labels only where the text changes', () => {
    expect(visibleTicks(labelled(['Sep', 'Sep', 'Oct', 'Oct', 'Nov']), 0).map((p) => p.label)).toEqual(['Sep', 'Oct', 'Nov']);
  });
  it('skips blank labels', () => expect(visibleTicks(labelled(['', 'A', '', 'B']), 0).map((p) => p.label)).toEqual(['A', 'B']));
  it('drops a label that would crowd the previous one', () => {
    const pts = labelled(['A', 'B', 'C', 'D']); // 133px apart
    expect(visibleTicks(pts, 200).map((p) => p.label)).toEqual(['A', 'C']);
  });
});
