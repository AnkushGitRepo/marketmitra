// Screener feature (ADR 0025): a thin client of fundamentals-api's bulk
// screener_metrics endpoints, shared by the Screener page, the MCP
// run_screener tool, and (via chatTools.ts's generic MCP-tool wrapping)
// Mitra's chat tool — one function, every caller, so none of them can
// drift onto a different filter shape than the others.

import { getJson } from './fundamentalsApi';

const FUNDAMENTALS_BASE_URL = process.env.FUNDAMENTALS_API_URL ?? 'http://localhost:8420';
import {
  buildScreenerQuery,
  type ScreenerFacets,
  type ScreenerFilters,
  type ScreenerPage,
  type ScreenerResultRow,
  type ScreenerStats,
} from './screenerSchema';

// Result/facet types and buildScreenerQuery now live in screenerSchema.ts
// (see its own comment) — re-exported here so existing server-side callers
// of this module don't need to change their import path.
export { buildScreenerQuery };
export type { ScreenerFacets, ScreenerPage, ScreenerResultRow, ScreenerStats };

/** Filters the bulk-refreshed screener_metrics table. Never throws — an
 * unreachable fundamentals-api or a bad query returns [], same "no data
 * available, not a crash" contract every other function in this module
 * follows. Cached for an hour: this table is refreshed at most once a day
 * by the bulk job, so a tighter revalidate window buys nothing. */
export async function runScreener(filters: ScreenerFilters): Promise<ScreenerResultRow[]> {
  const query = buildScreenerQuery(filters);
  const path = query ? `/screener?${query}` : '/screener';
  const result = await getJson<ScreenerResultRow[]>(path, 3600);
  return result ?? [];
}

/** One page of results plus the total match count (from fundamentals-api's
 * `X-Total-Count` header), for pagination and CSV export. Never throws — an
 * unreachable backend yields an empty page. Short revalidate: the table only
 * changes when the daily jobs run, but a filter change must feel live. */
export async function runScreenerPage(filters: ScreenerFilters): Promise<ScreenerPage> {
  const query = buildScreenerQuery(filters);
  const path = query ? `/screener?${query}` : '/screener';
  try {
    const response = await fetch(`${FUNDAMENTALS_BASE_URL}${path}`, { next: { revalidate: 300 } });
    if (!response.ok) return { rows: [], total: 0 };
    const rows = (await response.json()) as ScreenerResultRow[];
    const total = Number(response.headers.get('x-total-count'));
    return { rows, total: Number.isFinite(total) && total >= rows.length ? total : rows.length };
  } catch {
    return { rows: [], total: 0 };
  }
}

/** Facets are cheap and fill in as the fundamentals backfill progresses, so
 * they're cached only briefly — an hour-long cache froze the dropdown at
 * whatever the first (nearly empty) scrape had produced. `sector` narrows
 * `industries` to that sector. */
export async function getScreenerFacets(sector?: string): Promise<ScreenerFacets> {
  const path = sector ? `/screener/facets?sector=${encodeURIComponent(sector)}` : '/screener/facets';
  const result = await getJson<ScreenerFacets>(path, 300);
  return result ?? { sectors: [], industries: [] };
}

/** Coverage + freshness of the screener table; null if fundamentals-api is
 * unreachable. Short cache — it changes only when the daily jobs run. */
export function getScreenerStats(): Promise<ScreenerStats | null> {
  return getJson<ScreenerStats>('/screener/stats', 600);
}
