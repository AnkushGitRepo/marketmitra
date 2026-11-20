// Loads what the Fund X-Ray needs and builds the findings: the fund, its peers, and the signed-in user's holdings.
// Server only. Shared by the fund page and the two X-Ray routes so they cannot disagree.

import { getEnrichedHoldings, type EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import { hashInput } from '@/lib/insights';
import { getFund, getFundFacets, getFundPeers } from './api';
import type { FundDetail } from './types';
import { buildXray, type XrayFacts, type XrayItem } from './xray';

/** Holdings are enriched with a company profile each plus live quotes; past this the fund page stops waiting for them. */
const HOLDINGS_TIMEOUT_MS = 4000;

/** The user's holdings, or null when they did not arrive in time (not the same as having none). */
export async function loadHoldings(userId: string, timeoutMs = HOLDINGS_TIMEOUT_MS): Promise<EnrichedHolding[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([getEnrichedHoldings(userId), late]);
  } finally {
    clearTimeout(timer);
  }
}

/** What the Mitra write-up is a function of: the findings. The same hash keys the cache and checks a stored write-up is current. */
export function xrayInputHash(items: readonly XrayItem[]): string {
  return hashInput({ v: 1, items: items.map((item) => [item.key, item.tone, item.text]) });
}

export type XrayLoad =
  | { readonly ok: true; readonly fund: FundDetail; readonly facts: XrayFacts }
  | { readonly ok: false; readonly reason: 'not_found' | 'unavailable' };

export async function loadXray(userId: string, schemeCode: number): Promise<XrayLoad> {
  const [fund, peers, holdings] = await Promise.all([getFund(schemeCode), getFundPeers(schemeCode), loadHoldings(userId)]);
  if (!fund) {
    // The data service answers 404 for an unknown code and nothing at all when it is down; tell them apart.
    return { ok: false, reason: (await getFundFacets()).categories.length > 0 ? 'not_found' : 'unavailable' };
  }
  // A failed peers request only leaves the comparisons out; the fund itself decides whether there is anything to show.
  return { ok: true, fund, facts: buildXray(fund, peers ?? [], holdings) };
}
