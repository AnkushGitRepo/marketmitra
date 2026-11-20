import { describe, expect, it } from 'vitest';
import { adjustForUnitChanges, simulateSip, SIP_AMOUNTS, SIP_YEARS } from './sip';
import type { NavPoint } from './types';

const DAY_MS = 86_400_000;

/** One NAV per calendar day ending on `end`, compounding at `annualRate` (0.12 = 12% a year). */
function dailySeries(days: number, annualRate: number, end = '2026-11-17'): NavPoint[] {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const daily = (1 + annualRate) ** (1 / 365);
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(endMs - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10),
    nav: 100 * daily ** i,
  }));
}

describe('simulateSip', () => {
  it('invests one instalment a month for the chosen years', () => {
    const result = simulateSip(dailySeries(4 * 366, 0.1), 10_000, 3);
    expect(result?.instalments).toBe(36);
    expect(result?.invested).toBe(360_000);
  });

  it('a flat NAV returns exactly what was put in, at 0% XIRR', () => {
    const result = simulateSip(dailySeries(4 * 366, 0), 5_000, 3);
    expect(result?.value).toBeCloseTo(180_000, 4);
    expect(result?.xirr).toBeCloseTo(0, 3);
  });

  it('a NAV compounding at 12% a year gives a 12% XIRR whatever the instalment dates', () => {
    const result = simulateSip(dailySeries(6 * 366, 0.12), 10_000, 5);
    expect(result?.xirr).toBeCloseTo(12, 1);
    expect(result?.value).toBeGreaterThan(result?.invested ?? Infinity);
  });

  it('a falling NAV shows a loss', () => {
    const result = simulateSip(dailySeries(4 * 366, -0.2), 10_000, 3);
    expect(result?.value).toBeLessThan(result?.invested ?? 0);
    expect(result?.xirr).toBeLessThan(0);
  });

  it('plots invested and value at every instalment and at the last NAV date', () => {
    const result = simulateSip(dailySeries(4 * 366, 0.1), 10_000, 3);
    const points = result?.points ?? [];
    expect(points).toHaveLength(37);
    expect(points[0]?.invested).toBe(10_000);
    expect(points[points.length - 1]).toMatchObject({ date: '2026-11-17', invested: 360_000 });
    expect(points.map((p) => p.invested)).toEqual([...points.map((p) => p.invested)].sort((a, b) => a - b));
  });

  it('refuses when the fund is younger than the window, never extrapolating', () => {
    expect(simulateSip(dailySeries(2 * 366, 0.1), 10_000, 3)).toBeNull();
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('refuses an invalid amount (%s)', (amount) => {
    expect(simulateSip(dailySeries(4 * 366, 0.1), amount, 3)).toBeNull();
  });

  it('refuses a series with fewer than two points', () => {
    expect(simulateSip([{ date: '2026-11-17', nav: 10 }], 10_000, 1)).toBeNull();
  });

  it('refuses a non-positive NAV rather than dividing by it', () => {
    // 2025-12-17 is the second instalment's date for a 1-year window ending 2026-11-17.
    const series = dailySeries(2 * 366, 0.1).map((p) => (p.date === '2025-12-17' ? { ...p, nav: 0 } : p));
    expect(simulateSip(series, 10_000, 1)).toBeNull();
  });

  it('does not change the series it is given', () => {
    const series = dailySeries(2 * 366, 0.1);
    const copy = JSON.stringify(series);
    simulateSip(series, 10_000, 1);
    expect(JSON.stringify(series)).toBe(copy);
  });

  it('clamps a 31st instalment to the end of a short month', () => {
    const result = simulateSip(dailySeries(3 * 366, 0.1, '2026-10-31'), 1_000, 1);
    expect(result?.points.map((p) => p.date)).toContain('2026-02-28');
  });
});

describe('unit splits and consolidations', () => {
  /** Flat NAV that drops tenfold overnight (a 10:1 split) halfway through. */
  const split = (): NavPoint[] =>
    dailySeries(4 * 366, 0).map((p, i, all) => (i >= all.length / 2 ? { ...p, nav: p.nav / 10 } : p));

  it('treats a one-day move beyond 40% as no return, like the data service', () => {
    const adjusted = adjustForUnitChanges(split());
    const navs = adjusted.map((p) => p.nav);
    expect(Math.max(...navs) / Math.min(...navs)).toBeCloseTo(1, 6);
  });

  it('keeps the real last NAV after adjusting', () => {
    const series = split();
    const adjusted = adjustForUnitChanges(series);
    expect(adjusted[adjusted.length - 1]?.nav).toBeCloseTo(series[series.length - 1]?.nav ?? 0, 9);
  });

  it('leaves a series with no jump exactly as it was', () => {
    const series = dailySeries(400, 0.1);
    expect(adjustForUnitChanges(series)).toEqual(series);
  });

  it('a split does not look like a 90% loss in the simulation', () => {
    const result = simulateSip(split(), 10_000, 3);
    expect(result?.value).toBeCloseTo(result?.invested ?? 0, 3);
    expect(result?.xirr).toBeCloseTo(0, 2);
  });

  it('does not change the series it is given', () => {
    const series = split();
    const copy = JSON.stringify(series);
    adjustForUnitChanges(series);
    expect(JSON.stringify(series)).toBe(copy);
  });
});

describe('presets', () => {
  it('offers the three monthly amounts and three windows', () => {
    expect(SIP_AMOUNTS).toEqual([5_000, 10_000, 25_000]);
    expect(SIP_YEARS).toEqual([1, 3, 5]);
  });
});
