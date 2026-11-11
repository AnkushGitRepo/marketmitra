import { describe, expect, it } from 'vitest';
import { DAILY_AI_CAP, LOCAL_DAILY_AI_CAP, canSpend, resolveDailyCap, isHeartbeatDue, istDay, recordSpend } from './caps';

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
      expect(canSpend(usage, now, DAILY_AI_CAP)).toBe(true);
      usage = recordSpend(usage, now);
    }
    expect(usage.count).toBe(DAILY_AI_CAP);
    expect(canSpend(usage, now, DAILY_AI_CAP)).toBe(false);
  });
  it('starts a fresh count on a new day', () => {
    const yesterday = { day: '2026-11-10', count: DAILY_AI_CAP };
    expect(canSpend(yesterday, now, DAILY_AI_CAP)).toBe(true);
    expect(recordSpend(yesterday, now)).toEqual({ day: '2026-11-11', count: 1 });
  });
  it('does not mutate the usage it is given', () => {
    const u = { day: '2026-11-11', count: 3 };
    recordSpend(u, now);
    expect(u.count).toBe(3);
  });
});

describe('resolveDailyCap', () => {
  it('is fixed when hosted, whatever the override says', () => {
    expect(resolveDailyCap(true, undefined)).toBe(20);
    expect(resolveDailyCap(true, '500')).toBe(20);
  });
  it('is high by default when not hosted', () => {
    expect(resolveDailyCap(false, undefined)).toBe(LOCAL_DAILY_AI_CAP);
    expect(resolveDailyCap(false, '')).toBe(LOCAL_DAILY_AI_CAP);
    expect(LOCAL_DAILY_AI_CAP).toBeGreaterThan(DAILY_AI_CAP);
  });
  it('takes a whole-number override, never below the hosted cap or above the maximum, and ignores junk', () => {
    expect(resolveDailyCap(false, '60')).toBe(60);
    expect(resolveDailyCap(false, '5')).toBe(20);
    expect(resolveDailyCap(false, '99999')).toBe(1000);
    expect(resolveDailyCap(false, 'lots')).toBe(LOCAL_DAILY_AI_CAP);
    expect(resolveDailyCap(false, '40.5')).toBe(LOCAL_DAILY_AI_CAP);
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
