// Screener feature (ADR 0025): a thin client of fundamentals-api's bulk
// screener_metrics endpoints, shared by the Screener page, the MCP
// run_screener tool, and (via chatTools.ts's generic MCP-tool wrapping)
// Mitra's chat tool — one function, every caller, so none of them can
// drift onto a different filter shape than the others.

import { getJson } from './fundamentalsApi';
import {
  buildScreenerQuery,
  type ScreenerFacets,
  type ScreenerFilters,
  type ScreenerResultRow,
} from './screenerSchema';

// Result/facet types and buildScreenerQuery now live in screenerSchema.ts
// (see its own comment) — re-exported here so existing server-side callers
// of this module don't need to change their import path.
export { buildScreenerQuery };
export type { ScreenerFacets, ScreenerResultRow };

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

export async function getScreenerFacets(): Promise<ScreenerFacets> {
  const result = await getJson<ScreenerFacets>('/screener/facets', 3600);
  return result ?? { sectors: [], industries: [] };
}
