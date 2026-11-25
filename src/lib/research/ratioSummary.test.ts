import { describe, expect, it } from 'vitest';
import { summariseRatios } from './ratioSummary';

const r = (name: string, value: string | null, unit: string | null = null) => ({
  name,
  value,
  unit,
  as_of: '2026-09-30',
  source_tier: 'tier3',
});

describe('summariseRatios', () => {
  it('keeps only valuation and quality ratios', () => {
    expect(
      summariseRatios([r('Stock P/E', '40.2'), r('Book Value', '120'), r('ROCE', '12.1', '%'), r('ROE', null)])
    ).toBe('Stock P/E 40.2; ROCE 12.1 %');
  });
  it('is empty when nothing relevant exists', () => {
    expect(summariseRatios(null)).toBe('');
    expect(summariseRatios([r('Face Value', '10')])).toBe('');
  });
});
