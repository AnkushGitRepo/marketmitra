import { describe, expect, it } from 'vitest';
import { cashSummary } from './summary';

describe('cashSummary', () => {
  it('splits the total into equity and cash shares', () => {
    expect(cashSummary(75_000, 25_000)).toEqual({ equity: 75_000, cash: 25_000, total: 100_000, equityPct: 75, cashPct: 25 });
  });
  it('is all zero for an empty account instead of dividing by zero', () => {
    expect(cashSummary(0, 0)).toEqual({ equity: 0, cash: 0, total: 0, equityPct: 0, cashPct: 0 });
  });
  it('ignores negative inputs', () => expect(cashSummary(-5, 100)).toMatchObject({ equity: 0, cashPct: 100 }));
});
