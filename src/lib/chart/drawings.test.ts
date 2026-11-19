import { describe, expect, it } from 'vitest';
import {
  FIB_LEVELS,
  describeDrawing,
  fibPrices,
  measure,
  positionLevels,
  toggleHidden,
  visibleDrawings,
  type Drawing,
} from './drawings';

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

describe('describeDrawing', () => {
  const a = { time: '2026-03-02', price: 1234.5 };
  it('names a drawing by its kind and where it sits', () => {
    expect(describeDrawing({ id: '1', kind: 'hline', a })).toEqual({
      name: 'Horizontal line',
      detail: '₹1,234.5',
    });
    expect(describeDrawing({ id: '2', kind: 'vline', a })).toEqual({
      name: 'Vertical line',
      detail: '2026-03-02',
    });
    expect(describeDrawing({ id: '3', kind: 'text', a, text: 'Breakout' })).toEqual({
      name: 'Note',
      detail: 'Breakout',
    });
    expect(
      describeDrawing({ id: '4', kind: 'long', a, b: { time: '2026-03-09', price: 1300 } }).name,
    ).toBe('Long position');
  });
});

describe('hiding drawings', () => {
  const a = { time: '2026-03-02', price: 100 };
  const list: Drawing[] = [
    { id: '1', kind: 'hline', a },
    { id: '2', kind: 'vline', a },
  ];

  it('toggles one drawing hidden and back, without changing the list it was given', () => {
    const hidden = toggleHidden(list, '1');
    expect(hidden[0].hidden).toBe(true);
    expect(hidden[1].hidden).toBeUndefined();
    expect(list[0].hidden).toBeUndefined();
    expect(toggleHidden(hidden, '1')[0].hidden).toBe(false);
  });

  it('draws only the drawings that are not hidden', () => {
    expect(visibleDrawings(toggleHidden(list, '2')).map((d) => d.id)).toEqual(['1']);
    expect(visibleDrawings(list)).toHaveLength(2);
  });

  it('ignores an unknown id', () => {
    expect(toggleHidden(list, 'nope')).toEqual(list);
  });
});
