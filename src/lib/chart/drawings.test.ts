import { describe, expect, it } from 'vitest';
import { FIB_LEVELS, fibPrices, measure, positionLevels } from './drawings';

describe('fibPrices', () => {
  it('places each level between the two anchor prices (0 at p2, 1 at p1)', () => {
    const levels = fibPrices(200, 100);
    expect(levels.find((l) => l.ratio === 0)!.price).toBe(100);
    expect(levels.find((l) => l.ratio === 1)!.price).toBe(200);
    expect(levels.find((l) => l.ratio === 0.5)!.price).toBe(150);
  });
  it('works for a downward swing', () => {
    expect(fibPrices(100, 200).find((l) => l.ratio === 0.5)!.price).toBe(150);
  });
  it('exposes the standard retracement ratios', () => {
    expect(FIB_LEVELS).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
  });
});

describe('measure', () => {
  it('reports price change, percent and bar count', () => {
    expect(measure({ price: 100, index: 10 }, { price: 110, index: 25 })).toEqual({
      change: 10,
      percent: 10,
      bars: 15,
    });
  });
  it('is negative for a decline and bars are absolute', () => {
    expect(measure({ price: 200, index: 30 }, { price: 150, index: 10 })).toEqual({
      change: -50,
      percent: -25,
      bars: 20,
    });
  });
});

describe('positionLevels', () => {
  it('puts the stop on the other side of entry at half the target distance, so a long reads 2 : 1', () => {
    expect(positionLevels('long', 100, 110)).toEqual({
      stop: 95,
      riskReward: 2,
      targetPct: 10,
      stopPct: -5,
    });
  });
  it('mirrors for a short', () => {
    expect(positionLevels('short', 100, 90)).toEqual({
      stop: 105,
      riskReward: 2,
      targetPct: -10,
      stopPct: 5,
    });
  });
});
