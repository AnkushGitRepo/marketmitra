// What /funds shows before anyone has touched it, and how a link's filters sit on top of that. Pure.

import type { FundFilters } from './params';

/**
 * Opening view: diversified funds (no sector or thematic funds), Direct plan, best Sharpe first. Sorting by
 * 3-year return put the most volatile sector funds on top, and Sharpe alone does not fix that on real data:
 * the top of the Sharpe list is sector funds too, so they are left out of the opening view and one toggle brings them back.
 */
export const DEFAULT_FILTERS: FundFilters = { plan: 'direct', sort: 'sharpe_3y', order: 'desc', exclude_thematic: true };

export const DEFAULT_SORT = { key: 'sharpe_3y', dir: 'desc' } as const;

/** What "Clear all" returns to. */
export const CLEARED_FILTERS: FundFilters = DEFAULT_FILTERS;

/** True while a name is typed or a sub-category chosen: the reader is looking for something specific. */
export function isSearching(filters: Pick<FundFilters, 'q' | 'sub_category'>): boolean {
  return Boolean(filters.q?.trim() || filters.sub_category);
}

/** The opening view with a link's filters on top. The reader's choice about sector funds is kept as it is. */
export function resolveFilters(fromUrl: FundFilters): FundFilters {
  return { ...DEFAULT_FILTERS, ...fromUrl };
}

/**
 * What is actually asked of the data service. Looking for something specific is never hidden by the diversified
 * view, but the choice itself is left in `filters`, so clearing the search goes back to the view that was chosen.
 */
export function effectiveFilters(filters: FundFilters): FundFilters {
  if (!isSearching(filters)) return filters;
  const rest: FundFilters = { ...filters };
  delete rest.exclude_thematic;
  return rest;
}
