// One parser for screener query strings, shared by GET /api/screener, the CSV
// export, and the page's URL-synced filter state — so all three accept exactly
// the same inputs and reject the same bad ones.

import {
  SCREENER_RANGE_FIELDS,
  screenerFiltersSchema,
  type RangeFieldKey,
  type ScreenerFilters,
} from '@/lib/dashboard/screenerSchema';

export type ParsedFilters = { ok: true; filters: ScreenerFilters } | { ok: false; message: string };

export const MAX_PAGE_SIZE = 500;

type ParamSource = Pick<URLSearchParams, 'get'>;

export function parseScreenerParams(params: ParamSource): ParsedFilters {
  const filters: ScreenerFilters = {};

  for (const field of SCREENER_RANGE_FIELDS) {
    for (const suffix of ['min', 'max'] as const) {
      const key: `${RangeFieldKey}_min` | `${RangeFieldKey}_max` = `${field.key}_${suffix}`;
      const raw = params.get(key);
      if (raw === null || raw === '') continue;
      const num = Number(raw);
      if (!Number.isFinite(num))
        return { ok: false, message: `${key} must be a number, got "${raw}"` };
      filters[key] = num;
    }
  }

  for (const key of ['sector', 'industry', 'q'] as const) {
    const raw = params.get(key)?.trim();
    if (raw) filters[key] = raw.slice(0, key === 'q' ? 64 : 128);
  }

  const sortBy = params.get('sort_by');
  if (sortBy) {
    const parsed = screenerFiltersSchema.shape.sort_by.safeParse(sortBy);
    if (!parsed.success) {
      return {
        ok: false,
        message: `sort_by must be one of the filterable fields, got "${sortBy}"`,
      };
    }
    filters.sort_by = parsed.data;
  }
  const order = params.get('order');
  if (order) {
    const parsed = screenerFiltersSchema.shape.order.safeParse(order);
    if (!parsed.success) return { ok: false, message: 'order must be "asc" or "desc"' };
    filters.order = parsed.data;
  }

  const limitRaw = params.get('limit');
  if (limitRaw) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return { ok: false, message: `limit must be a whole number from 1 to ${MAX_PAGE_SIZE}` };
    }
    filters.limit = limit;
  }
  const offsetRaw = params.get('offset');
  if (offsetRaw) {
    const offset = Number(offsetRaw);
    if (!Number.isInteger(offset) || offset < 0) {
      return { ok: false, message: 'offset must be a whole number, 0 or more' };
    }
    filters.offset = offset;
  }

  return { ok: true, filters };
}
