import { describe, expect, it } from 'vitest';
import { buildRace, buildRaceChart, RACE_BASE, RACE_WINDOWS } from './growthRace';
import type { NavPoint } from './types';

const DAY_MS = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One NAV per calendar day ending on `end`, compounding at `annualRate`. */
function daily(days: number, annualRate: number, end = '2026-11-17', start = 100): NavPoint[] {
  const endMs = Date.parse(`${end}T00:00:00Z`);
  const step = (1 + annualRate) ** (1 / 365);
  return Array.from({ length: days }, (_, i) => ({ date: iso(endMs - (days - 1 - i) * DAY_MS), nav: start * step ** i }));
}

const input = (code: number, series: NavPoint[]) => ({ code, name: `Fund ${code}`, series });
const THREE_YEARS = 1096;

describe('RACE_WINDOWS', () => {
  it('offers 1Y, 3Y and 5Y, matching the NAV ranges the API serves', () => {
    expect(RACE_WINDOWS.map((w) => [w.id, w.days])).toEqual([['1y', 365], ['3y', 1096], ['5y', 1826]]);
    expect(RACE_BASE).toBe(10_000);
  });
});

describe('buildRace', () => {
  it('starts every fund at ₹10,000 on the same day, whatever its NAV was', () => {
    const race = buildRace([input(1, daily(2000, 0.1, '2026-11-17', 10)), input(2, daily(2000, 0.2, '2026-11-17', 900))], THREE_YEARS);
    expect(race.ok).toBe(true);
    if (!race.ok) return;
    for (const line of race.lines) {
      expect(line.points[0]).toEqual({ date: race.start, value: RACE_BASE });
    }
  });

  it('ends each fund at what ₹10,000 would have become: a 12% fund is worth 10000 x 1.12^3 after three years', () => {
    const race = buildRace([input(1, daily(2000, 0.12)), input(2, daily(2000, 0.0))], THREE_YEARS);
    if (!race.ok) throw new Error('expected a race');
    const [a, b] = race.lines;
    expect(a?.final).toBeCloseTo(RACE_BASE * 1.12 ** (THREE_YEARS / 365), 0);
    expect(b?.final).toBeCloseTo(RACE_BASE, 3);
    expect(a?.changePct).toBeCloseTo((1.12 ** (THREE_YEARS / 365) - 1) * 100, 1);
  });

  it('puts every line on the same start and end dates, using the earliest last NAV', () => {
    const race = buildRace([input(1, daily(2000, 0.1, '2026-11-17')), input(2, daily(2000, 0.1, '2026-11-14'))], THREE_YEARS);
    if (!race.ok) throw new Error('expected a race');
    expect(race.end).toBe('2026-11-14');
    for (const line of race.lines) expect(line.points[line.points.length - 1]?.date <= '2026-11-14').toBe(true);
  });

  it('refuses a window a fund is too young for, naming it, rather than extrapolating', () => {
    const race = buildRace([input(1, daily(2000, 0.1)), input(2, daily(400, 0.1))], THREE_YEARS);
    expect(race).toEqual({ ok: false, reason: 'too_young', names: ['Fund 2'] });
  });

  it('accepts a fund whose history begins within a week of the window start', () => {
    const race = buildRace([input(1, daily(2000, 0.1)), input(2, daily(THREE_YEARS - 3, 0.1))], THREE_YEARS);
    expect(race.ok).toBe(true);
  });

  it('says there is no data for a fund with fewer than two NAVs', () => {
    expect(buildRace([input(1, daily(2000, 0.1)), input(2, [])], THREE_YEARS)).toEqual({ ok: false, reason: 'no_data', names: ['Fund 2'] });
  });

  it('treats a unit split as no return, like the rest of the page', () => {
    const split = daily(2000, 0).map((p, i, all) => (i >= all.length / 2 ? { ...p, nav: p.nav / 10 } : p));
    const race = buildRace([input(1, split), input(2, daily(2000, 0.1))], THREE_YEARS);
    if (!race.ok) throw new Error('expected a race');
    expect(race.lines[0]?.final).toBeCloseTo(RACE_BASE, 3);
  });

  it('thins long histories to a bounded number of points, keeping the first and last', () => {
    const race = buildRace([input(1, daily(2000, 0.1)), input(2, daily(2000, 0.1))], THREE_YEARS, 50);
    if (!race.ok) throw new Error('expected a race');
    for (const line of race.lines) {
      expect(line.points.length).toBeLessThanOrEqual(50);
      expect(line.points[line.points.length - 1]?.date).toBe(race.end);
    }
  });

  it('does not depend on the order the series arrives in', () => {
    const series = daily(2000, 0.1);
    const shuffled = [...series].reverse();
    expect(buildRace([input(1, shuffled), input(2, daily(2000, 0.1))], THREE_YEARS)).toEqual(buildRace([input(1, series), input(2, daily(2000, 0.1))], THREE_YEARS));
  });

  it('does not call a fund too young just because its latest NAV is weeks newer than another fund\'s', () => {
    // Fund 1's feed stops 30 days earlier; fund 2 has plenty of history before the common window starts.
    const race = buildRace([input(1, daily(2000, 0.1, '2026-10-18')), input(2, daily(2100, 0.1, '2026-11-17'))], THREE_YEARS);
    expect(race.ok).toBe(true);
  });

  it('does not change the series it is given', () => {
    const series = daily(2000, 0.1);
    const copy = JSON.stringify(series);
    buildRace([input(1, series), input(2, daily(2000, 0.1))], THREE_YEARS);
    expect(JSON.stringify(series)).toBe(copy);
  });
});

describe('buildRaceChart', () => {
  const race = buildRace([input(1, daily(2000, 0.3)), input(2, daily(2000, -0.1))], THREE_YEARS);

  it('draws one path per fund on a shared scale, from the left gutter to the right padding', () => {
    if (!race.ok) throw new Error('expected a race');
    const chart = buildRaceChart(race, 720, 280, 24, 90);
    expect(chart.paths.map((p) => p.code)).toEqual([1, 2]);
    expect(chart.paths[0]?.d.startsWith('M90,')).toBe(true);
    expect(chart.max).toBeGreaterThan(RACE_BASE);
    expect(chart.min).toBeLessThan(RACE_BASE);
  });

  it('keeps the base line inside the plot, and puts the highest value at the top', () => {
    if (!race.ok) throw new Error('expected a race');
    const chart = buildRaceChart(race, 720, 280, 24, 90);
    expect(chart.baseY).toBeGreaterThan(24);
    expect(chart.baseY).toBeLessThan(280 - 24);
    const top = chart.paths[0]?.d.split(' ').map((s) => Number(s.slice(1).split(',')[1])) ?? [];
    expect(Math.min(...top)).toBeCloseTo(24, 0);
  });
});
