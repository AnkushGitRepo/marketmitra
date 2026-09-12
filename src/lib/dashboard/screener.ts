// Screener feature (ADR 0025): a thin client of fundamentals-api's bulk
// screener_metrics endpoints, shared by the Screener page, the MCP
// run_screener tool, and (via chatTools.ts's generic MCP-tool wrapping)
// Mitra's chat tool — one function, every caller, so none of them can
// drift onto a different filter shape than the others.

import { getJson } from './fundamentalsApi';
import type { ScreenerFilters } from './screenerSchema';

export interface ScreenerResultRow {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  current_price: number | null;
  pe: number | null;
  book_value: number | null;
  pb: number | null;
  dividend_yield: number | null;
  roce: number | null;
  roe: number | null;
  face_value: number | null;
  debt_to_equity: number | null;
  sales_growth_3y_cagr: number | null;
  profit_growth_3y_cagr: number | null;
  fetch_status: string;
  source_tier: string;
  fetched_at: string;
}

export interface ScreenerFacets {
  sectors: string[];
  industries: string[];
}

/** Exported so the Screener page's client component can build the same
 * query string for its own `/api/screener` fetch, without duplicating
 * this logic. */
export function buildScreenerQuery(filters: ScreenerFilters): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

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
