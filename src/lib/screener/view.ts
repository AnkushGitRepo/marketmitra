// What the screener shows for the current filters: which columns to promote and tint, which metrics the mobile cards
// carry, how many filters are active, and the sort options. Pure: no I/O.

import { SCREENER_RANGE_FIELDS, type RangeFieldKey, type ScreenerFilters } from '@/lib/dashboard/screenerSchema';
import { describeFilters, rangeKey } from './draft';

/** Metrics a card shows when nothing narrower is being screened. */
export const DEFAULT_CARD_METRICS: readonly RangeFieldKey[] = ['market_cap', 'pe', 'roe', 'debt_to_equity'];
export const CARD_METRIC_COUNT = 4;

/** Range fields that currently have a bound, in field order. */
export function filteredFieldKeys(filters: ScreenerFilters): RangeFieldKey[] {
  return SCREENER_RANGE_FIELDS.map((f) => f.key).filter(
    (key) => filters[rangeKey(key, 'min')] !== undefined || filters[rangeKey(key, 'max')] !== undefined
  );
}

/** Columns to tint: the filtered fields plus the one being sorted. */
export function highlightedKeys(filters: ScreenerFilters): Set<string> {
  const keys = new Set<string>(filteredFieldKeys(filters));
  if (filters.sort_by) keys.add(filters.sort_by);
  return keys;
}

/** Highlighted columns first (original order kept within each group), so what you are screening on sits beside the company. */
export function orderColumns<T extends { readonly key: string }>(columns: readonly T[], highlighted: ReadonlySet<string>): T[] {
  return [...columns.filter((c) => highlighted.has(c.key)), ...columns.filter((c) => !highlighted.has(c.key))];
}

/** The metric keys for a mobile card: screened fields first, then the defaults, no repeats, `count` in total. */
export function cardMetricKeys(filters: ScreenerFilters, count = CARD_METRIC_COUNT): RangeFieldKey[] {
  const keys: RangeFieldKey[] = [];
  const sorted = filters.sort_by;
  for (const key of [...filteredFieldKeys(filters), ...(sorted ? [sorted] : []), ...DEFAULT_CARD_METRICS]) {
    if (!keys.includes(key)) keys.push(key);
    if (keys.length === count) break;
  }
  return keys;
}

export function activeFilterCount(filters: ScreenerFilters): number {
  return describeFilters(filters).length;
}

export interface SortOption {
  readonly value: string;
  readonly label: string;
}

export const SORT_OPTIONS: readonly SortOption[] = SCREENER_RANGE_FIELDS.flatMap((f) => [
  { value: `${f.key}:desc`, label: `${f.label}: high to low` },
  { value: `${f.key}:asc`, label: `${f.label}: low to high` },
]);

/** The server's default order when none is chosen. */
const DEFAULT_SORT = { sort_by: 'market_cap', order: 'desc' } as const;

export function sortValueOf(filters: ScreenerFilters): string {
  return `${filters.sort_by ?? DEFAULT_SORT.sort_by}:${filters.order ?? DEFAULT_SORT.order}`;
}

export function parseSortValue(value: string): Pick<ScreenerFilters, 'sort_by' | 'order'> | null {
  const [key, order] = value.split(':');
  const known = SCREENER_RANGE_FIELDS.some((f) => f.key === key);
  if (!known || (order !== 'asc' && order !== 'desc')) return null;
  return { sort_by: key as RangeFieldKey, order };
}
