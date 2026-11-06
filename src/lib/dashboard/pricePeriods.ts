import type { PricePeriod, PricePointOut } from './fundamentalsApi';

/** Same windows the fundamentals-api applies for each `period` (see
 * `_PRICE_PERIOD_LOOKBACK` in fundamentals_service.py). */
export const PERIOD_LOOKBACK_DAYS: Record<PricePeriod, number> = {
  '1mo': 30,
  '6mo': 182,
  '1y': 365,
  '5y': 365 * 5,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Slices one 5-year price series down to a shorter period.
 *
 * The API serves every period from the same cached 5-year rows, so fetching
 * `5y` once and slicing here returns exactly what four separate requests
 * would — for a quarter of the network calls (the dashboard otherwise makes
 * 4 × holdings of them). Order is preserved. */
export function slicePricesByPeriod(
  rows: PricePointOut[] | null,
  period: PricePeriod,
  today: Date = new Date()
): PricePointOut[] {
  if (!rows) return [];
  const cutoff = new Date(today.getTime() - PERIOD_LOOKBACK_DAYS[period] * DAY_MS).toISOString().slice(0, 10);
  return rows.filter((r) => r.trade_date >= cutoff);
}
