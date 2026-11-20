// One-click investor lenses: named presets over the same filters as the filter panel, so a
// lens is just a shareable URL and the panel shows what it set. Thresholds live here and
// nowhere else. Pure, so it tests without a browser.

import { canonicalQuery } from './draft';
import type { FundFilters } from './params';

export type LensId = 'core' | 'quality' | 'steady' | 'tax';

export interface Lens {
  readonly id: LensId;
  readonly label: string;
  /** The rule in words, shown as the pill's tooltip: a lens is never a black box. */
  readonly rule: string;
  readonly filters: FundFilters;
}

export const LENSES: readonly Lens[] = [
  {
    id: 'core',
    label: 'Core index',
    rule: 'Funds with "Index" in their name (equity and debt) and an expense ratio of 0.5% or less, cheapest first.',
    filters: { q: 'index', max_expense_ratio: 0.5, sort: 'expense_ratio', order: 'asc' },
  },
  {
    id: 'quality',
    label: 'Strong risk-adjusted returns',
    rule: 'Diversified funds (no sector or thematic funds) with a Sharpe ratio above 1.1 and a 3-year return above 18% a year, best Sharpe first.',
    filters: { min_sharpe_3y: 1.1, min_ret_3y: 18, exclude_thematic: true, sort: 'sharpe_3y', order: 'desc' },
  },
  {
    id: 'steady',
    label: 'Low volatility',
    rule: 'Diversified funds (no sector or thematic funds) with volatility of 14% or less and a worst 3-year fall of 15% or less, calmest first.',
    filters: { max_std_dev_3y: 14, max_fall_3y: 15, exclude_thematic: true, sort: 'std_dev_3y', order: 'asc' },
  },
  {
    id: 'tax',
    label: 'Tax saver (ELSS)',
    rule: 'ELSS tax-saver funds, best 3-year return first.',
    filters: { sub_category: 'ELSS Tax Saver Fund', sort: 'ret_3y', order: 'desc' },
  },
];

/** The data service's own default sort (best 3-year return first), so a link that leaves it out compares equal. */
function withExplicitSort(filters: FundFilters): FundFilters {
  return { ...filters, sort: filters.sort ?? 'ret_3y', order: filters.order ?? 'desc' };
}

/** The screen a lens stands for. Earlier filters are replaced; only the chosen plan carries over. */
export function lensFilters(lens: Lens, base: FundFilters): FundFilters {
  return { plan: base.plan ?? 'direct', ...lens.filters };
}

/** Which lens, if any, the applied filters are exactly; the plan and paging do not matter. */
export function activeLens(filters: FundFilters): LensId | null {
  const key = canonicalQuery(withExplicitSort({ ...filters, plan: undefined }));
  const match = LENSES.find((lens) => canonicalQuery(withExplicitSort(lens.filters)) === key);
  return match?.id ?? null;
}
