import { describe, expect, it } from 'vitest';
import { shortDate } from './format';

describe('shortDate', () => {
  it('prints the day without a leading zero', () => expect(shortDate('2026-03-01')).toBe('1 Mar 2026'));
  it('is locale and time-zone free', () => expect(shortDate('2024-12-31')).toBe('31 Dec 2024'));
  it('returns other text as it was', () => {
    expect(shortDate('')).toBe('');
    expect(shortDate('2026-13-01')).toBe('2026-13-01');
    expect(shortDate('soon')).toBe('soon');
  });
});
