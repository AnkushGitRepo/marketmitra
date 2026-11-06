// Form-draft <-> applied-filters helpers for the Screener panel. The draft
// holds raw input strings (so a half-typed "1." isn't lost); applied filters
// are validated numbers.

import {
  SCREENER_RANGE_FIELDS,
  type RangeFieldKey,
  type ScreenerFilters,
  type ScreenerRangeField,
} from '@/lib/dashboard/screenerSchema';

export type RangeKey = `${RangeFieldKey}_min` | `${RangeFieldKey}_max`;
export type Draft = Partial<Record<RangeKey, string>> & {
  sector: string;
  industry: string;
  q: string;
};

export function rangeKey(key: RangeFieldKey, suffix: 'min' | 'max'): RangeKey {
  return `${key}_${suffix}`;
}

export function draftFromFilters(filters: ScreenerFilters): Draft {
  const draft = {
    sector: filters.sector ?? '',
    industry: filters.industry ?? '',
    q: filters.q ?? '',
  } as Draft;
  for (const field of SCREENER_RANGE_FIELDS) {
    const min = filters[rangeKey(field.key, 'min')];
    const max = filters[rangeKey(field.key, 'max')];
    draft[rangeKey(field.key, 'min')] = min !== undefined ? String(min) : '';
    draft[rangeKey(field.key, 'max')] = max !== undefined ? String(max) : '';
  }
  return draft;
}

export type BuiltFilters = { ok: true; filters: ScreenerFilters } | { ok: false; error: string };

/** Validates a draft into filters, carrying over the current sort. */
export function buildFilters(
  draft: Draft,
  sort: Pick<ScreenerFilters, 'sort_by' | 'order'>,
): BuiltFilters {
  const filters: ScreenerFilters = {};
  for (const field of SCREENER_RANGE_FIELDS) {
    const minRaw = draft[rangeKey(field.key, 'min')]?.trim();
    const maxRaw = draft[rangeKey(field.key, 'max')]?.trim();
    let min: number | undefined;
    let max: number | undefined;
    if (minRaw) {
      min = Number(minRaw);
      if (!Number.isFinite(min))
        return { ok: false, error: `${field.label}: enter a valid minimum.` };
    }
    if (maxRaw) {
      max = Number(maxRaw);
      if (!Number.isFinite(max))
        return { ok: false, error: `${field.label}: enter a valid maximum.` };
    }
    if (min !== undefined && max !== undefined && min > max) {
      return { ok: false, error: `${field.label}: minimum can't exceed maximum.` };
    }
    if (min !== undefined) filters[rangeKey(field.key, 'min')] = min;
    if (max !== undefined) filters[rangeKey(field.key, 'max')] = max;
  }
  if (draft.sector) filters.sector = draft.sector;
  if (draft.industry) filters.industry = draft.industry;
  const q = draft.q.trim();
  if (q) filters.q = q;
  if (sort.sort_by) filters.sort_by = sort.sort_by;
  if (sort.order) filters.order = sort.order;
  return { ok: true, filters };
}

export interface ActiveFilter {
  id: string;
  label: string;
  /** Filter keys removed when this chip is dismissed. */
  keys: (keyof ScreenerFilters)[];
}

function formatBound(field: ScreenerRangeField, value: number): string {
  const text = value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  if (field.unit === '₹ Cr') return `₹${text} Cr`;
  return field.unit === '%' ? `${text}%` : text;
}

/** Human-readable chips for what's currently applied (sort/paging excluded). */
export function describeFilters(filters: ScreenerFilters): ActiveFilter[] {
  const chips: ActiveFilter[] = [];
  if (filters.q) chips.push({ id: 'q', label: `“${filters.q}”`, keys: ['q'] });
  if (filters.sector)
    chips.push({ id: 'sector', label: filters.sector, keys: ['sector', 'industry'] });
  if (filters.industry) chips.push({ id: 'industry', label: filters.industry, keys: ['industry'] });
  for (const field of SCREENER_RANGE_FIELDS) {
    const minKey = rangeKey(field.key, 'min');
    const maxKey = rangeKey(field.key, 'max');
    const min = filters[minKey];
    const max = filters[maxKey];
    if (min === undefined && max === undefined) continue;
    const label =
      min !== undefined && max !== undefined
        ? `${field.label} ${formatBound(field, min)} – ${formatBound(field, max)}`
        : min !== undefined
          ? `${field.label} ≥ ${formatBound(field, min)}`
          : `${field.label} ≤ ${formatBound(field, max as number)}`;
    chips.push({ id: field.key, label, keys: [minKey, maxKey] });
  }
  return chips;
}

export function withoutKeys(
  filters: ScreenerFilters,
  keys: readonly (keyof ScreenerFilters)[],
): ScreenerFilters {
  const next: Record<string, unknown> = { ...filters };
  for (const key of keys) delete next[key];
  return next as ScreenerFilters;
}
