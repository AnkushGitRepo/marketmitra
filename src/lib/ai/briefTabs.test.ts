import { describe, expect, it } from 'vitest';
import { pointsForTab, tabCounts } from './briefTabs';
import type { BriefPoint } from './stockBrief';

const points: BriefPoint[] = [
  { key: 'quality', signal: 'strength', text: 'a' },
  { key: 'growth', signal: 'strength', text: 'b' },
  { key: 'valuation', signal: 'concern', text: 'c' },
  { key: 'ownership', signal: 'neutral', text: 'd' },
  { key: 'risk', signal: 'concern', text: 'e' },
];

describe('pointsForTab', () => {
  it('lists every point under All, strengths under Supports, concerns under Weak spots', () => {
    expect(pointsForTab(points, 'all')).toHaveLength(5);
    expect(pointsForTab(points, 'supports').map((p) => p.key)).toEqual(['quality', 'growth']);
    expect(pointsForTab(points, 'weak').map((p) => p.key)).toEqual(['valuation', 'risk']);
  });
  it('lists only the valuation point under Valuation, and keeps neutral points to All', () => {
    expect(pointsForTab(points, 'valuation').map((p) => p.key)).toEqual(['valuation']);
    expect(['supports', 'weak', 'valuation'].flatMap((t) => pointsForTab(points, t as never)).some((p) => p.signal === 'neutral')).toBe(false);
  });
  it('counts per tab and does not mutate the input', () => {
    expect(tabCounts(points)).toEqual({ all: 5, supports: 2, weak: 2, valuation: 1 });
    expect(points).toHaveLength(5);
    expect(tabCounts([])).toEqual({ all: 0, supports: 0, weak: 0, valuation: 0 });
  });
});
