import { describe, expect, it } from 'vitest';
import type { Bar } from '@/lib/chart/bars';
import { MOBILE_RANGES, rangeChangePct, windowBars } from './chartRange';

const bars: Bar[] = Array.from({ length: 400 }, (_, i) => ({ time: `d${i}`, open: i, high: i, low: i, close: 100 + i, volume: 1 }));

describe('windowBars', () => {
  it('takes roughly the trailing trading days for each range', () => {
    expect(windowBars(bars, '1M')).toHaveLength(21);
    expect(windowBars(bars, '3M')).toHaveLength(63);
    expect(windowBars(bars, '6M')).toHaveLength(126);
    expect(windowBars(bars, '1Y')).toHaveLength(252);
  });
  it('returns everything for 5Y and when there are fewer bars than the window, keeping the newest', () => {
    expect(windowBars(bars, '5Y')).toHaveLength(400);
    expect(windowBars(bars.slice(0, 10), '1Y')).toHaveLength(10);
    expect(windowBars(bars, '1M').at(-1)?.time).toBe('d399');
  });
  it('does not mutate the input', () => {
    windowBars(bars, '1M');
    expect(bars).toHaveLength(400);
  });
  it('offers the phone ranges in order', () => expect(MOBILE_RANGES).toEqual(['1M', '3M', '6M', '1Y', '5Y']));
});

describe('rangeChangePct', () => {
  it('is the percentage move from first to last close', () => {
    expect(rangeChangePct([{ ...bars[0], close: 100 }, { ...bars[1], close: 110 }])).toBe(10);
  });
  it('is null for fewer than two bars or a zero start', () => {
    expect(rangeChangePct([bars[0]])).toBeNull();
    expect(rangeChangePct([{ ...bars[0], close: 0 }, bars[1]])).toBeNull();
  });
});
