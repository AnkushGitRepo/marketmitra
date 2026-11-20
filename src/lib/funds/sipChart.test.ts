import { describe, expect, it } from 'vitest';
import { buildSipChart } from './sipChart';
import type { SipPoint } from './sip';

const points: SipPoint[] = [
  { date: '2026-01-01', invested: 100, value: 100 },
  { date: '2026-02-01', invested: 200, value: 230 },
  { date: '2026-03-01', invested: 300, value: 280 },
];

describe('buildSipChart', () => {
  it('needs at least two points', () => {
    expect(buildSipChart(points.slice(0, 1), 720, 280, 24)).toBeNull();
  });

  it('puts both lines on one scale: the highest value at the top, zero at the bottom', () => {
    const chart = buildSipChart(points, 720, 280, 24);
    expect(chart?.max).toBe(300);
    const top = Math.min(...(chart?.marks ?? []).map((m) => Math.min(m.valueY, m.investedY)));
    const bottom = Math.max(...(chart?.marks ?? []).map((m) => Math.max(m.valueY, m.investedY)));
    expect(top).toBeCloseTo(24 + (1 - 300 / 300) * 232, 6);
    expect(bottom).toBeLessThanOrEqual(280 - 24);
  });

  it('draws the invested line below the value line when the fund gained', () => {
    const marks = buildSipChart(points, 720, 280, 24)?.marks ?? [];
    expect((marks[1] as { valueY: number; investedY: number }).valueY).toBeLessThan((marks[1] as { investedY: number }).investedY);
  });

  it('returns an SVG path for each line and spans the width', () => {
    const chart = buildSipChart(points, 720, 280, 24);
    expect(chart?.valuePath.startsWith('M24,')).toBe(true);
    expect(chart?.investedPath.split('L')).toHaveLength(3);
    expect(chart?.marks[2]?.x).toBeCloseTo(720 - 24, 6);
  });

  it('does not change the points it is given', () => {
    const copy = JSON.stringify(points);
    buildSipChart(points, 720, 280, 24);
    expect(JSON.stringify(points)).toBe(copy);
  });

  it('starts the lines after a left gutter and ends at the right padding', () => {
    const chart = buildSipChart(points, 720, 280, 24, 80);
    expect(chart?.marks[0]?.x).toBe(80);
    expect(chart?.marks[2]?.x).toBeCloseTo(720 - 24, 6);
    expect(chart?.valuePath.startsWith('M80,')).toBe(true);
  });

  it('is unchanged when no gutter is given', () => {
    expect(buildSipChart(points, 720, 280, 24)).toEqual(buildSipChart(points, 720, 280, 24, 24));
  });
});
