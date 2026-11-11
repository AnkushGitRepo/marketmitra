import { describe, expect, it } from 'vitest';
import { DAILY_AI_CAP, canSpend, isHeartbeatDue, istDay, recordSpend } from './caps';

describe('istDay', () => {
  it('uses the Indian calendar day, which differs from UTC late in the evening', () => {
    expect(istDay(new Date('2026-11-11T20:00:00Z'))).toBe('2026-11-12'); // 01:30 IST next day
    expect(istDay(new Date('2026-11-11T05:00:00Z'))).toBe('2026-11-11');
  });
});

describe('daily AI cap', () => {
  const now = new Date('2026-11-11T05:00:00Z');
  it('allows spending until the cap and then refuses', () => {
    let usage = { day: istDay(now), count: 0 };
    for (let i = 0; i < DAILY_AI_CAP; i++) {
      expect(canSpend(usage, now)).toBe(true);
      usage = recordSpend(usage, now);
    }
    expect(usage.count).toBe(DAILY_AI_CAP);
    expect(canSpend(usage, now)).toBe(false);
  });
  it('starts a fresh count on a new day', () => {
    const yesterday = { day: '2026-11-10', count: DAILY_AI_CAP };
    expect(canSpend(yesterday, now)).toBe(true);
    expect(recordSpend(yesterday, now)).toEqual({ day: '2026-11-11', count: 1 });
  });
  it('does not mutate the usage it is given', () => {
    const u = { day: '2026-11-11', count: 3 };
    recordSpend(u, now);
    expect(u.count).toBe(3);
  });
});

describe('isHeartbeatDue', () => {
  it('is due after the 16:00 IST close buffer when the last check was on an earlier day', () => {
    const after = new Date('2026-11-11T11:00:00Z'); // 16:30 IST
    expect(isHeartbeatDue(new Date('2026-11-10T11:00:00Z'), after)).toBe(true);
    expect(isHeartbeatDue(null, after)).toBe(true);
  });
  it('is not due before 16:00 IST, or once already checked today', () => {
    expect(isHeartbeatDue(new Date('2026-11-10T11:00:00Z'), new Date('2026-11-11T09:00:00Z'))).toBe(false); // 14:30 IST
    expect(isHeartbeatDue(new Date('2026-11-11T10:45:00Z'), new Date('2026-11-11T11:30:00Z'))).toBe(false);
  });
});
