// The tabs on the generated 360 brief (#152): the same points, filtered by what the data says. Pure.

import type { BriefPoint } from './stockBrief';

export type BriefTab = 'all' | 'supports' | 'weak' | 'valuation';

export const BRIEF_TABS: ReadonlyArray<{ id: BriefTab; label: string }> = [
  { id: 'all', label: 'All points' },
  { id: 'supports', label: 'Supports' },
  { id: 'weak', label: 'Weak spots' },
  { id: 'valuation', label: 'Valuation' },
];

/** The points a tab lists. "Valuation" lists the valuation point; the tab also carries the computed sensitivity check. Neutral points show under All. */
export function pointsForTab(points: readonly BriefPoint[], tab: BriefTab): BriefPoint[] {
  switch (tab) {
    case 'all':
      return [...points];
    case 'supports':
      return points.filter((p) => p.signal === 'strength');
    case 'weak':
      return points.filter((p) => p.signal === 'concern');
    case 'valuation':
      return points.filter((p) => p.key === 'valuation');
  }
}

export function tabCounts(points: readonly BriefPoint[]): Record<BriefTab, number> {
  return { all: points.length, supports: pointsForTab(points, 'supports').length, weak: pointsForTab(points, 'weak').length, valuation: pointsForTab(points, 'valuation').length };
}
