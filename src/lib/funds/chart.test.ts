import { describe, expect, it } from 'vitest';
import { buildChart, downsample, nearestPoint, parseNavSeries } from './chart';
import type { NavPoint } from './types';

const series = (n: number): NavPoint[] =>
  Array.from({ length: n }, (_, i) => ({ date: `2025-01-${String((i % 28) + 1).padStart(2, '0')}`, nav: 100 + i }));

describe('downsample', () => {
  it('returns short series untouched', () => {
    const s = series(10);
    expect(downsample(s, 50)).toEqual(s);
  });

  it('caps the length but always keeps the first and last point', () => {
    const s = series(5000);
    const d = downsample(s, 300);
    expect(d.length).toBeLessThanOrEqual(300);
    expect(d[0]).toEqual(s[0]);
    expect(d[d.length - 1]).toEqual(s[s.length - 1]);
  });
});

describe('buildChart', () => {
  it('maps the series into the box with the low at the bottom and the high at the top', () => {
    const chart = buildChart([{ date: '2025-01-01', nav: 10 }, { date: '2025-01-02', nav: 20 }, { date: '2025-01-03', nav: 15 }], 300, 100, 10);
    expect(chart).not.toBeNull();
    expect(chart?.points[0]).toMatchObject({ x: 10, y: 90 });
    expect(chart?.points[1]).toMatchObject({ x: 150, y: 10 });
    expect(chart?.points[2]?.x).toBe(290);
    expect(chart?.path.startsWith('M10,90')).toBe(true);
    expect(chart?.change).toBeCloseTo(50);
  });

  it('draws a flat series in the middle instead of dividing by zero', () => {
    const chart = buildChart([{ date: 'a', nav: 5 }, { date: 'b', nav: 5 }], 200, 100, 10);
    expect(chart?.points.every((p) => Number.isFinite(p.y) && p.y === 50)).toBe(true);
  });

  it('needs at least two points', () => {
    expect(buildChart([], 200, 100, 10)).toBeNull();
    expect(buildChart([{ date: 'a', nav: 1 }], 200, 100, 10)).toBeNull();
  });
});

describe('buildChart with a left gutter for the axis labels', () => {
  const two = [{ date: '2025-01-01', nav: 10 }, { date: '2025-01-02', nav: 20 }];

  it('starts the line after the gutter and still ends at the right padding', () => {
    const chart = buildChart(two, 300, 100, 10, 60);
    expect(chart?.points[0]?.x).toBe(60);
    expect(chart?.points[1]?.x).toBe(290);
  });

  it('is unchanged when no gutter is given', () => {
    expect(buildChart(two, 300, 100, 10)).toEqual(buildChart(two, 300, 100, 10, 10));
  });

  it('keeps the lowest point at the bottom of the plot and the highest at the top, whatever the gutter', () => {
    const chart = buildChart(two, 300, 100, 10, 60);
    expect(chart?.points[0]?.y).toBe(90);
    expect(chart?.points[1]?.y).toBe(10);
  });
});

describe('nearestPoint', () => {
  it('finds the closest point by x', () => {
    const chart = buildChart(series(11), 1000, 100, 0);
    expect(chart && nearestPoint(chart.points, 502)?.index).toBe(5);
    expect(chart && nearestPoint(chart.points, -50)?.index).toBe(0);
    expect(chart && nearestPoint(chart.points, 5000)?.index).toBe(10);
  });
});

describe('parseNavSeries', () => {
  it('accepts a well-formed series', () => {
    expect(parseNavSeries([{ date: '2026-01-01', nav: 10.5 }])).toEqual([{ date: '2026-01-01', nav: 10.5 }]);
    expect(parseNavSeries([])).toEqual([]);
  });

  it.each([[null], ['x'], [{}], [[{ date: 1, nav: 2 }]], [[{ date: 'd', nav: 'x' }]], [[{ date: 'd', nav: NaN }]], [[null]]])(
    'rejects %j',
    (input) => expect(parseNavSeries(input)).toBeNull(),
  );
});

describe('buildChart: a bottom margin of its own (#300)', () => {
  const series = [{ date: '2025-01-01', nav: 10 }, { date: '2025-01-02', nav: 20 }, { date: '2025-01-03', nav: 15 }];

  it('keeps the lowest point padBottom above the bottom edge and the highest one pad below the top', () => {
    const chart = buildChart(series, 300, 200, 10, 40, 50)!;
    expect(Math.min(...chart.points.map((p) => p.y))).toBe(10);
    expect(Math.max(...chart.points.map((p) => p.y))).toBe(150);
  });

  it('defaults the bottom margin to the same pad, as before', () => {
    const chart = buildChart(series, 300, 200, 10, 40)!;
    expect(Math.max(...chart.points.map((p) => p.y))).toBe(190);
    expect(buildChart(series, 300, 200, 10)!.points[0]!.x).toBe(10);
  });
});
