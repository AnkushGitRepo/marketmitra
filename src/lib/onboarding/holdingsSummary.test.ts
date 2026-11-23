import { describe, expect, it } from 'vitest';
import { formatSummary, summarizeHoldings } from './holdingsSummary';

describe('summarizeHoldings', () => {
  it('counts rows and sums quantity times average price', () => {
    expect(summarizeHoldings([{ quantity: 10, avgPrice: 1250 }, { quantity: 1, avgPrice: 2310.35 }])).toEqual({ count: 2, invested: 14810.35 });
  });
  it('is zero for an empty list', () => {
    expect(summarizeHoldings([])).toEqual({ count: 0, invested: 0 });
  });
});

describe('formatSummary', () => {
  it('uses Indian grouping and whole rupees', () => {
    expect(formatSummary([{ quantity: 100, avgPrice: 1254.5 }])).toBe('1 holding · ₹1,25,450 invested');
  });
  it('pluralises', () => {
    expect(formatSummary([{ quantity: 1, avgPrice: 10 }, { quantity: 1, avgPrice: 10 }])).toBe('2 holdings · ₹20 invested');
  });
});
