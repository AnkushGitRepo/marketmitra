import { NextResponse } from 'next/server';
import { runScreener } from '@/lib/dashboard/screener';
import {
  SCREENER_RANGE_FIELDS,
  screenerFiltersSchema,
  type RangeFieldKey,
  type ScreenerFilters,
} from '@/lib/dashboard/screenerSchema';

// Public, read-only market data — no auth, same deliberate bare-JSON
// exception already established for GET /api/search and GET /api/news
// (ADR 0025): a pass-through aggregate of already-public data, not a
// user-scoped/mutating resource, so it skips the standard
// {success,data,error} envelope.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filters: ScreenerFilters = {};

  for (const field of SCREENER_RANGE_FIELDS) {
    for (const suffix of ['min', 'max'] as const) {
      const key: `${RangeFieldKey}_min` | `${RangeFieldKey}_max` = `${field.key}_${suffix}`;
      const raw = searchParams.get(key);
      if (raw === null) continue;
      const num = Number(raw);
      if (!Number.isFinite(num)) {
        return NextResponse.json(
          { error: 'invalid_filter', message: `${key} must be a number, got "${raw}"` },
          { status: 400 }
        );
      }
      filters[key] = num;
    }
  }

  const sector = searchParams.get('sector');
  if (sector) filters.sector = sector;
  const industry = searchParams.get('industry');
  if (industry) filters.industry = industry;

  // Validated against the same schema Mitra's tool uses, so only a real
  // range-field key (never an arbitrary column name) reaches the backend.
  const sortBy = searchParams.get('sort_by');
  if (sortBy) {
    const parsed = screenerFiltersSchema.shape.sort_by.safeParse(sortBy);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_filter', message: `sort_by must be one of the filterable fields, got "${sortBy}"` },
        { status: 400 }
      );
    }
    filters.sort_by = parsed.data;
  }
  const order = searchParams.get('order');
  if (order) {
    const parsed = screenerFiltersSchema.shape.order.safeParse(order);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_filter', message: 'order must be "asc" or "desc"' },
        { status: 400 }
      );
    }
    filters.order = parsed.data;
  }

  const limitRaw = searchParams.get('limit');
  if (limitRaw !== null) {
    const limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit < 1) {
      return NextResponse.json(
        { error: 'invalid_filter', message: 'limit must be a positive number' },
        { status: 400 }
      );
    }
    filters.limit = limit;
  }

  const results = await runScreener(filters);
  return NextResponse.json(results);
}
