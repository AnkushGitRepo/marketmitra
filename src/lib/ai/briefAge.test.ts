import { describe, expect, it } from 'vitest';
import { BRIEF_MAX_AGE_MS, briefAge } from './briefAge';

const NOW = new Date('2026-11-26T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3_600_000;

describe('briefAge', () => {
  it('has no age for a brief with no timestamp, and never expires it', () => {
    expect(briefAge(null, NOW, 6 * HOUR)).toEqual({ label: null, expired: false });
    expect(briefAge('not a date', NOW, 6 * HOUR)).toEqual({ label: null, expired: false });
  });

  it('labels how long ago it was written and keeps it while inside the limit', () => {
    expect(briefAge(ago(2 * HOUR), NOW, 6 * HOUR)).toEqual({ label: '2 hours ago', expired: false });
    expect(briefAge(ago(10_000), NOW, 6 * HOUR)).toEqual({ label: 'just now', expired: false });
  });

  it('expires a brief at its limit, not before', () => {
    expect(briefAge(ago(6 * HOUR - 1), NOW, 6 * HOUR).expired).toBe(false);
    expect(briefAge(ago(6 * HOUR), NOW, 6 * HOUR).expired).toBe(true);
  });

  it('never expires when no limit is given (the IPO brief)', () => {
    expect(briefAge(ago(400 * HOUR), NOW, null).expired).toBe(false);
  });

  it('treats a timestamp slightly in the future (clock skew) as just now', () => {
    expect(briefAge(new Date(NOW.getTime() + 5_000).toISOString(), NOW, HOUR)).toEqual({ label: 'just now', expired: false });
  });

  it('sets the limits: the daily brief a day, the market and news reads six hours', () => {
    expect(BRIEF_MAX_AGE_MS.portfolio).toBe(24 * HOUR);
    expect(BRIEF_MAX_AGE_MS.market).toBe(6 * HOUR);
    expect(BRIEF_MAX_AGE_MS.news).toBe(6 * HOUR);
  });
});
