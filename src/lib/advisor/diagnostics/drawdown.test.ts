import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { reviewDrawdowns } from './drawdown';

describe('reviewDrawdowns', () => {
  it('lists holdings down at least the threshold on cost, worst first', () => {
    const rows = reviewDrawdowns(HOLDINGS, 30);
    expect(rows.map((r) => r.symbol)).toEqual(['DDD']);
    expect(rows[0].returnPct).toBeCloseTo(-70, 0);
    expect(rows[0].lossINR).toBeCloseTo(233.33, 1);
    expect(rows[0].weightPct).toBeCloseTo(10, 0);
  });

  it('respects the threshold and ignores unpriced holdings', () => {
    expect(reviewDrawdowns(HOLDINGS, 80)).toEqual([]);
    expect(reviewDrawdowns([{ ...HOLDINGS[3], ltp: null }], 10)).toEqual([]);
  });
});
