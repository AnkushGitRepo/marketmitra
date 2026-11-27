import { describe, expect, it } from 'vitest';
import { yearRange } from './yearRange';

describe('yearRange', () => {
  it('places the price between low and high', () => expect(yearRange(150, 100, 200)).toEqual({ position: 0.5, badge: null }));
  it('flags near the high and near the low', () => {
    expect(yearRange(198, 100, 200)?.badge).toBe('near-high');
    expect(yearRange(102, 100, 200)?.badge).toBe('near-low');
  });
  it('clamps a price outside the range', () => expect(yearRange(250, 100, 200)).toEqual({ position: 1, badge: 'near-high' }));
  it('is null when anything is missing or the range is empty', () => {
    expect(yearRange(null, 1, 2)).toBeNull();
    expect(yearRange(1, null, 2)).toBeNull();
    expect(yearRange(5, 10, 10)).toBeNull();
  });
});
