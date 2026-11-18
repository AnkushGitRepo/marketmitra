// Server-side client for fundamentals-api `/funds` (ADR 0067); the service address is `FUNDS_API_URL`, else `FUNDAMENTALS_API_URL` (baseUrl.ts), shared by the
// /funds pages and the /api/funds routes so neither can drift from the other.
// Never throws: an unreachable service returns null / [], the same "no data
// available, not a crash" contract as the rest of src/lib/dashboard.

import { getJson } from '@/lib/dashboard/fundamentalsApi';
import { fundsBaseUrl } from './baseUrl';
import { buildFundsQuery, type FundFilters } from './params';
import type { FundDetail, FundFacets, FundPage, FundSummary, NavPoint, NavRange } from './types';

// The data changes once a day (after AMFI publishes), so a short cache keeps filters feeling live.
const LIST_REVALIDATE_S = 300;
const DETAIL_REVALIDATE_S = 900;
const FACETS_REVALIDATE_S = 3600;

/** The same fetch as every other data-service call, aimed at the funds service address (resolved per call). */
function fundsJson<T>(path: string, revalidateSeconds: number): Promise<T | null> {
  return getJson<T>(path, revalidateSeconds, fundsBaseUrl());
}

export function listFunds(filters: FundFilters): Promise<FundPage | null> {
  const query = buildFundsQuery(filters);
  return fundsJson<FundPage>(query ? `/funds?${query}` : '/funds', LIST_REVALIDATE_S);
}

export function getFund(schemeCode: number): Promise<FundDetail | null> {
  return fundsJson<FundDetail>(`/funds/${schemeCode}`, DETAIL_REVALIDATE_S);
}

/** The stored NAV series; `[]` means none stored yet, `null` means the data service did not answer. */
export function getFundNav(schemeCode: number, range: NavRange): Promise<NavPoint[] | null> {
  return fundsJson<NavPoint[]>(`/funds/${schemeCode}/nav?range=${range}`, DETAIL_REVALIDATE_S);
}

/** Peer funds; `[]` means none, `null` means the data service did not answer. */
export function getFundPeers(schemeCode: number): Promise<FundSummary[] | null> {
  return fundsJson<FundSummary[]>(`/funds/${schemeCode}/peers`, DETAIL_REVALIDATE_S);
}

export async function getFundFacets(): Promise<FundFacets> {
  return (
    (await fundsJson<FundFacets>('/funds/facets', FACETS_REVALIDATE_S)) ?? {
      categories: [],
      sub_categories: {},
      fund_houses: [],
      nav_as_of: null,
    }
  );
}
