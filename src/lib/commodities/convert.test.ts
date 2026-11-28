import { describe, expect, it } from 'vitest';
import { GOLD_22K_RATIO, goldSilverRatio, isDutyStale, parityPrice, withGst } from './convert';

describe('parityPrice', () => {
  it('converts gold to rupees per 10 g with the duty', () => {
    // 2000 USD/oz at 80 INR/USD = 5144.2 per gram; x10 g; x1.15 duty
    expect(parityPrice('gold', 2000, 80, 15)).toBeCloseTo(((2000 * 80) / 31.1035) * 10 * 1.15, 4);
  });
  it('uses per kg for silver and per gram for platinum', () => {
    const perGram = (30 * 90) / 31.1035;
    expect(parityPrice('silver', 30, 90, 0)).toBeCloseTo(perGram * 1000, 4);
    expect(parityPrice('platinum', 30, 90, 0)).toBeCloseTo(perGram, 4);
  });
  it('is null for a missing or non-positive input, never zero', () => {
    expect(parityPrice('gold', null, 80)).toBeNull();
    expect(parityPrice('gold', 2000, null)).toBeNull();
    expect(parityPrice('gold', 0, 80)).toBeNull();
    expect(parityPrice('gold', 2000, -1)).toBeNull();
  });
  it('matches the IBJA gold rate within 0.5% for the day checked in ADR 0086', () => {
    const p = parityPrice('gold', 3672.7, 92.98)!;
    expect(Math.abs(p / 126299 - 1)).toBeLessThan(0.005);
  });
});

describe('derived figures', () => {
  it('adds GST on top', () => expect(withGst(100000, 3)).toBeCloseTo(103000));
  it('22K is the 916/999 share of 24K', () => expect(100000 * GOLD_22K_RATIO).toBeCloseTo(91691.7, 0));
  it('gold-to-silver ratio is gold per kg over silver per kg', () => {
    expect(goldSilverRatio(126000, 150000)).toBeCloseTo(84);
    expect(goldSilverRatio(126000, null)).toBeNull();
    expect(goldSilverRatio(126000, 0)).toBeNull();
  });
});

describe('isDutyStale', () => {
  const now = new Date('2026-12-20T00:00:00Z');
  it('is fresh within the limit', () => expect(isDutyStale('2026-11-28', now)).toBe(false));
  it('is stale past it', () => expect(isDutyStale('2026-11-01', now)).toBe(true));
  it('treats an unreadable date as stale', () => expect(isDutyStale('soon', now)).toBe(true));
});
