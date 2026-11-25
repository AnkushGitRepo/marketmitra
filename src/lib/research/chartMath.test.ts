import { describe, expect, it } from 'vitest';
import { barRange, bestRows, donutArcs, fraction, linePaths, sortRows } from './chartMath';

describe('barRange', () => {
  it('includes zero and handles negatives and gaps', () => {
    expect(barRange([[10, null], [-4, 6]])).toEqual({ min: -4, max: 10 });
    expect(barRange([[5, 8]])).toEqual({ min: 0, max: 8 });
  });
  it('never returns an empty range', () => {
    expect(barRange([[null]])).toEqual({ min: 0, max: 1 });
    expect(barRange([[0, 0]])).toEqual({ min: 0, max: 1 });
  });
  it('places a value within the range', () => {
    expect(fraction(0, { min: -5, max: 5 })).toBe(0.5);
  });
});

describe('donutArcs', () => {
  it('lays arcs end to end and ignores empty slices', () => {
    const arcs = donutArcs([{ label: 'A', value: 3 }, { label: 'B', value: 0 }, { label: 'C', value: 1 }]);
    expect(arcs.map((a) => [a.label, a.share, a.start])).toEqual([['A', 0.75, 0], ['C', 0.25, 0.75]]);
  });
  it('is empty when nothing is positive', () => {
    expect(donutArcs([{ label: 'A', value: 0 }])).toEqual([]);
  });
});

describe('bestRows', () => {
  it('finds the highest or lowest, ties included', () => {
    expect(bestRows([1, 5, null, 5], 'high')).toEqual(new Set([1, 3]));
    expect(bestRows([1, 5, null], 'low')).toEqual(new Set([0]));
  });
  it('highlights nothing when there is nothing to compare', () => {
    expect(bestRows([4, null, 'x'], 'high')).toEqual(new Set());
  });
});

describe('sortRows', () => {
  const rows = [{ n: 'b', v: 2 }, { n: 'a', v: null }, { n: 'c', v: 9 }];
  it('sorts numbers both ways with missing figures last', () => {
    expect(sortRows(rows, 'v', 'asc').map((r) => r.n)).toEqual(['b', 'c', 'a']);
    expect(sortRows(rows, 'v', 'desc').map((r) => r.n)).toEqual(['c', 'b', 'a']);
  });
  it('sorts text, and does not change the input', () => {
    expect(sortRows(rows, 'n', 'asc').map((r) => r.n)).toEqual(['a', 'b', 'c']);
    expect(rows[0].n).toBe('b');
  });
});

describe('linePaths', () => {
  it('joins consecutive points into one path', () => {
    expect(linePaths([[0, 1], [10, 2], [20, 3]])).toEqual(['M0,1 L10,2 L20,3']);
  });
  it('breaks the line at a gap and drops a lone point', () => {
    expect(linePaths([[0, 1], [10, 2], null, [30, 4], null, [50, 5], [60, 6]])).toEqual(['M0,1 L10,2', 'M50,5 L60,6']);
  });
  it('is empty with no usable points', () => {
    expect(linePaths([null, [1, 1], null])).toEqual([]);
    expect(linePaths([])).toEqual([]);
  });
});
