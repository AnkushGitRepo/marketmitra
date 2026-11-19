import { describe, expect, it } from 'vitest';
import type { Bar } from './bars';
import {
  INTRADAY_RANGES,
  TIMEFRAMES,
  barTimeLabel,
  barTimeMs,
  intradayRangeAvailable,
  intradayRangeStart,
  isMarketOpen,
  isTailUpdate,
  parseBarTimeLabel,
  pollIntervalMs,
  toBarTime,
} from './timeframes';

const bar = (time: string, close = 1): Bar => ({
  time,
  open: close,
  high: close,
  low: close,
  close,
  volume: 1,
});

describe('timeframes', () => {
  it('lists the timeframes with Day as the default', () => {
    expect(TIMEFRAMES.map((t) => t.id)).toEqual([
      '1m',
      '5m',
      '15m',
      '30m',
      '1h',
      '1d',
      '1w',
      '1mo',
    ]);
  });
});

describe('pollIntervalMs', () => {
  it('follows the timeframe on the hosted site', () => {
    expect(pollIntervalMs('1m', true)).toBe(10_000);
    expect(pollIntervalMs('5m', true)).toBe(30_000);
    expect(pollIntervalMs('15m', true)).toBe(60_000);
    expect(pollIntervalMs('1h', true)).toBe(120_000);
    expect(pollIntervalMs('1d', true)).toBe(30_000);
  });
  it('is twice as fast locally, never under 5 seconds', () => {
    expect(pollIntervalMs('1m', false)).toBe(5_000);
    expect(pollIntervalMs('5m', false)).toBe(15_000);
    expect(pollIntervalMs('1h', false)).toBe(60_000);
  });
});

describe('bar times', () => {
  // 2026-11-18 09:15 IST = 03:45 UTC.
  const epoch = Date.UTC(2026, 10, 18, 3, 45) / 1000;

  it('shifts epoch seconds to IST wall-clock so the chart axis reads Indian time', () => {
    expect(toBarTime(epoch)).toBe(String(epoch + 19_800));
  });
  it('labels an intraday time as an IST date and time, and leaves a daily date alone', () => {
    expect(barTimeLabel(toBarTime(epoch))).toBe('2026-11-18 09:15');
    expect(barTimeLabel('2026-11-18')).toBe('2026-11-18');
  });
  it('parses a label back to the bar time it came from', () => {
    expect(parseBarTimeLabel('2026-11-18 09:15')).toBe(toBarTime(epoch));
    expect(parseBarTimeLabel('2026-11-18')).toBe('2026-11-18');
    expect(parseBarTimeLabel('nonsense')).toBeNull();
  });
  it('orders intraday and daily times on one millisecond scale', () => {
    expect(barTimeMs(toBarTime(epoch))).toBe((epoch + 19_800) * 1000);
    expect(barTimeMs('2026-11-18')).toBe(Date.UTC(2026, 10, 18));
  });
});

describe('isMarketOpen', () => {
  const at = (h: number, m: number, day = 18) =>
    new Date(Date.UTC(2026, 10, day, h, m) - 19_800_000); // IST wall clock
  it('is open on weekdays from 09:15 to 15:30 IST', () => {
    expect(isMarketOpen(at(9, 15))).toBe(true);
    expect(isMarketOpen(at(15, 29))).toBe(true);
    expect(isMarketOpen(at(9, 14))).toBe(false);
    expect(isMarketOpen(at(15, 30))).toBe(false);
  });
  it('is closed at weekends', () => {
    expect(isMarketOpen(at(11, 0, 21))).toBe(false); // Saturday 21 Nov 2026
    expect(isMarketOpen(at(11, 0, 22))).toBe(false); // Sunday
  });
});

describe('isTailUpdate', () => {
  const base = [bar('1'), bar('2'), bar('3')];
  it('is true when only the last bars changed or one was added', () => {
    expect(isTailUpdate(base, [bar('1'), bar('2'), bar('3', 5)])).toBe(true);
    expect(isTailUpdate(base, [...base, bar('4')])).toBe(true);
  });
  it('is false for a different series, a gap, or an earlier bar that changed identity', () => {
    expect(isTailUpdate(base, [bar('9'), bar('2'), bar('3')])).toBe(false);
    expect(isTailUpdate(base, [...base, bar('4'), bar('5'), bar('6'), bar('7')])).toBe(false);
    expect(isTailUpdate(base, [bar('1'), bar('2')])).toBe(false);
    expect(isTailUpdate([], base)).toBe(false);
  });
});

describe('intraday ranges', () => {
  // Three IST sessions of two bars each: 18, 19 and 20 Nov 2026 (09:15 and 09:16).
  const at = (date: string, hhmm: string) =>
    toBarTime(Date.parse(`${date}T${hhmm}:00Z`) / 1000 - 19_800);
  const bars = ['2026-11-18', '2026-11-19', '2026-11-20'].flatMap((d) => [
    bar(at(d, '09:15')),
    bar(at(d, '09:16')),
  ]);

  it('lists the ranges, All last', () => {
    expect(INTRADAY_RANGES).toEqual(['1D', '5D', '1M', 'ALL']);
  });

  it('starts at the first bar of the last day, or of the last N days', () => {
    expect(intradayRangeStart(bars, '1D')).toBe(4);
    expect(intradayRangeStart(bars, '5D')).toBe(0);
    expect(intradayRangeStart(bars, 'ALL')).toBe(0);
  });

  it('is available only when the data holds that many trading days', () => {
    expect(intradayRangeAvailable(bars, '1D')).toBe(true);
    expect(intradayRangeAvailable(bars, '5D')).toBe(false);
    expect(intradayRangeAvailable(bars, '1M')).toBe(false);
    expect(intradayRangeAvailable(bars, 'ALL')).toBe(true);
    expect(intradayRangeAvailable([], '1D')).toBe(false);
  });
});
