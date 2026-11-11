import { describe, expect, it } from 'vitest';
import { NOT_AVAILABLE, fmtCrore, fmtPct, fmtSigned, fmtTimes, otherHoldingPct, peBarPositions } from './signalFormat';

describe('formatters', () => {
  it('show "not available" for null and never "NaN"', () => {
    for (const f of [fmtPct, fmtTimes, fmtSigned]) expect(f(null)).toBe(NOT_AVAILABLE);
    expect(fmtCrore(null)).toBe(NOT_AVAILABLE);
    expect(fmtPct(Number.NaN)).toBe(NOT_AVAILABLE);
  });
  it('format numbers with sensible precision and signs', () => {
    expect(fmtPct(14.83)).toBe('14.8%');
    expect(fmtTimes(18.24)).toBe('18.2x');
    expect(fmtTimes(0.5, 2)).toBe('0.50x');
    expect(fmtSigned(-14.04, 1, '%')).toBe('-14.0%');
    expect(fmtSigned(1.2, 1, ' pts')).toBe('+1.2 pts');
    expect(fmtCrore(1200)).toBe('₹1,200 Cr');
    expect(fmtCrore(-50.4)).toBe('-₹50 Cr');
  });
});

describe('otherHoldingPct', () => {
  it('is what is left after promoter, FII and DII, never negative', () => {
    expect(otherHoldingPct(56.7, 11.2, 21.4)).toBeCloseTo(10.7, 5);
    expect(otherHoldingPct(60, 30, 20)).toBe(0);
    expect(otherHoldingPct(null, 10, 10)).toBeNull();
  });
});

describe('peBarPositions', () => {
  it('places P/E and the peer median on a shared 0-100 scale', () => {
    const p = peBarPositions(18, 24);
    expect(p?.median).toBeGreaterThan(p!.pe);
    expect(p!.median).toBeLessThanOrEqual(100);
    expect(p!.pe).toBeGreaterThan(0);
  });
  it('is null when either number is missing or not positive', () => {
    expect(peBarPositions(null, 24)).toBeNull();
    expect(peBarPositions(18, 0)).toBeNull();
  });
});
