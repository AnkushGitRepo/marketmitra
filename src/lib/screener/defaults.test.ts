import { describe, expect, it } from 'vitest';
import { QUOTE_ONLY_MIN_MARKET_CAP, isUntouchedSizeDefault } from './defaults';

describe('isUntouchedSizeDefault', () => {
  it('is true for the opening screen whichever board it is on', () => {
    expect(isUntouchedSizeDefault({ board: 'all', market_cap_min: QUOTE_ONLY_MIN_MARKET_CAP, sort_by: 'market_cap' })).toBe(true);
    expect(isUntouchedSizeDefault({ market_cap_min: 5000 })).toBe(true);
  });

  it('is false once the user has chosen another size or any other criterion', () => {
    expect(isUntouchedSizeDefault({ board: 'all', market_cap_min: 100 })).toBe(false);
    expect(isUntouchedSizeDefault({ board: 'all', market_cap_min: 5000, pe_max: 20 })).toBe(false);
    expect(isUntouchedSizeDefault({ board: 'all', roe_min: 15, debt_to_equity_max: 1 })).toBe(false);
    expect(isUntouchedSizeDefault({ board: 'all' })).toBe(false);
  });
});
