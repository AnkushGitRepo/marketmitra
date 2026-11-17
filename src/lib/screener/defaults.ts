// The screen the page opens with, and how it behaves when the board changes (ADR 0066).

import type { ScreenerFilters } from '@/lib/dashboard/screenerSchema';

/** The size floor of the opening screen while too few companies have scraped fundamentals for a profitability screen. */
export const QUOTE_ONLY_MIN_MARKET_CAP = 5000;

const NON_CRITERIA = new Set(['board', 'sort_by', 'order', 'limit', 'offset']);

/** Whether the only criterion in play is the opening screen's own size floor, i.e. the user has not chosen it. */
export function isUntouchedSizeDefault(filters: ScreenerFilters): boolean {
  const criteria = Object.entries(filters).filter(([key, value]) => !NON_CRITERIA.has(key) && value !== undefined);
  return criteria.length === 1 && filters.market_cap_min === QUOTE_ONLY_MIN_MARKET_CAP;
}
