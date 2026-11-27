import { describe, expect, it } from 'vitest';
import { alignToDates, alphaPct, returnPct, volatilityFan } from './compare';

describe('alignToDates', () => {
  it('takes the last close on or before each date and null before the series starts', () => {
    const closes = [{ date: '2026-01-05', close: 10 }, { date: '2026-01-07', close: 12 }];
    expect(alignToDates(['2026-01-04', '2026-01-05', '2026-01-06', '2026-01-09'], closes)).toEqual([null, 10, 10, 12]);
  });
});

describe('returnPct', () => {
  it('is relative to the first value', () => {
    const r = returnPct([100, 110, 90]);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeCloseTo(10);
    expect(r[2]).toBeCloseTo(-10);
  });
  it('skips leading nulls and keeps nulls', () => expect(returnPct([null, 50, 75])).toEqual([null, 0, 50]));
  it('is all null with no usable start', () => expect(returnPct([null, 0])).toEqual([null, null]));
});

describe('alphaPct', () => {
  it('is portfolio minus benchmark at the end', () => expect(alphaPct([0, 33.8], [0, 22.4])).toBeCloseTo(11.4));
  it('is null when an end is missing', () => expect(alphaPct([0, 5], [0, null])).toBeNull());
});

describe('volatilityFan', () => {
  it('needs enough history and positive values', () => {
    expect(volatilityFan([1, 2, 3])).toBeNull();
    expect(volatilityFan([1, 2, 3, 4, 5, 6, 7, -1])).toBeNull();
  });
  it('is flat for a flat series', () => {
    const fan = volatilityFan(Array(10).fill(100));
    expect(fan?.lo.every((v) => v === 100)).toBe(true);
  });
  it('widens around the last value as it looks further ahead', () => {
    const fan = volatilityFan([100, 104, 99, 103, 97, 105, 101, 108, 100, 106])!;
    const last = 106;
    expect(fan.lo[0]).toBeLessThan(last);
    expect(fan.hi[0]).toBeGreaterThan(last);
    expect(fan.hi[fan.hi.length - 1] - fan.lo[fan.lo.length - 1]).toBeGreaterThan(fan.hi[0] - fan.lo[0]);
  });
});
