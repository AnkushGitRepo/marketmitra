import { describe, expect, it } from 'vitest';
import { toCandleBars } from './yahooCandles';

const q = (
  iso: string,
  close: number | null,
  extra: Partial<Record<string, number | null>> = {},
) => ({
  date: new Date(iso),
  open: close,
  high: close,
  low: close,
  close,
  volume: 10,
  ...extra,
});

describe('toCandleBars', () => {
  it('turns intraday rows into IST bar times, oldest first, dropping incomplete rows', () => {
    const bars = toCandleBars(
      [
        q('2026-11-18T03:50:00Z', 101),
        q('2026-11-18T03:45:00Z', 100),
        q('2026-11-18T03:55:00Z', null),
        q('2026-11-18T04:00:00Z', 102, { high: null }),
      ],
      '5m',
    );
    expect(bars.map((b) => b.close)).toEqual([100, 101]);
    expect(bars[0].time).toBe(String(Date.UTC(2026, 10, 18, 3, 45) / 1000 + 19_800));
  });

  it('keeps the date as the time for daily rows', () => {
    const [bar] = toCandleBars([q('2026-11-18T03:45:00Z', 100)], '1d');
    expect(bar.time).toBe('2026-11-18');
  });

  it('snaps the still-forming last bar (stamped with the last trade time) back to its bar start', () => {
    const bars = toCandleBars(
      [q('2026-11-18T04:07:00Z', 100), q('2026-11-18T04:07:26Z', 101)],
      '1m',
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(101);
    // hourly bars start at :15
    const hourly = toCandleBars([q('2026-11-18T05:20:10Z', 100)], '1h');
    expect(hourly[0].time).toBe(String(Date.UTC(2026, 10, 18, 4, 45) / 1000 + 19_800));
  });

  it('keeps one bar per time, the later row winning', () => {
    const bars = toCandleBars(
      [q('2026-11-18T03:45:00Z', 100), q('2026-11-18T03:45:00Z', 105)],
      '1m',
    );
    expect(bars).toHaveLength(1);
    expect(bars[0].close).toBe(105);
  });
});
