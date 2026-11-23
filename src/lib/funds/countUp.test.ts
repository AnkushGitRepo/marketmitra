import { describe, expect, it } from 'vitest';
import { COUNT_UP_MS, countUpValue, easeOutCubic } from './countUp';

describe('easeOutCubic', () => {
  it('starts at 0, ends at 1 and is fastest at the start', () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 6);
    expect(easeOutCubic(0.1) - easeOutCubic(0)).toBeGreaterThan(easeOutCubic(1) - easeOutCubic(0.9));
  });

  it('clamps progress outside 0 to 1', () => {
    expect(easeOutCubic(-3)).toBe(0);
    expect(easeOutCubic(7)).toBe(1);
  });
});

describe('countUpValue (#304)', () => {
  it('moves from the old figure to the new one', () => {
    expect(countUpValue(100, 200, 0)).toBe(100);
    expect(countUpValue(100, 200, 1)).toBe(200);
    expect(countUpValue(100, 200, 0.5)).toBeCloseTo(187.5, 6);
  });

  it('works downwards and across zero (a gain turning into a loss)', () => {
    expect(countUpValue(200, 100, 0.5)).toBeCloseTo(112.5, 6);
    expect(countUpValue(50, -50, 1)).toBe(-50);
    expect(countUpValue(50, -50, 0.5)).toBeCloseTo(-37.5, 6);
  });

  it('lands exactly on the target when finished or past it', () => {
    expect(countUpValue(3, 9, 1)).toBe(9);
    expect(countUpValue(3, 9, 5)).toBe(9);
  });

  it('is quick: about 300 ms', () => {
    expect(COUNT_UP_MS).toBe(300);
  });
});
