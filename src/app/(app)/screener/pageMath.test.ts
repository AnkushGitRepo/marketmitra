import { describe, expect, it } from 'vitest';
import { pageCountFor, pageWindow } from './pageMath';

describe('pageWindow', () => {
  it('shows every page when there are few', () => {
    expect(pageWindow(0, 4)).toEqual([0, 1, 2, 3]);
  });

  it('collapses distant pages into gaps around the current page', () => {
    expect(pageWindow(9, 20)).toEqual([0, 'gap', 7, 8, 9, 10, 11, 'gap', 19]);
  });

  it('has no leading gap near the start or trailing gap near the end', () => {
    expect(pageWindow(1, 20)).toEqual([0, 1, 2, 3, 'gap', 19]);
    expect(pageWindow(19, 20)).toEqual([0, 'gap', 17, 18, 19]);
  });

  it('handles empty and single-page results', () => {
    expect(pageWindow(0, 0)).toEqual([]);
    expect(pageWindow(0, 1)).toEqual([0]);
  });
});

describe('pageCountFor', () => {
  it('rounds up and never returns zero', () => {
    expect(pageCountFor(101, 50)).toBe(3);
    expect(pageCountFor(100, 50)).toBe(2);
    expect(pageCountFor(0, 50)).toBe(1);
  });
});
