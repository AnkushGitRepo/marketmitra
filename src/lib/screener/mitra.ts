// Shared by Mitra's `run_screener` (data) and `open_screener` (navigation +
// data) tools (ADR 0034): runs a screen and shapes the result for a language
// model — compact rows, the true match count, and an honest coverage note —
// plus the deep link that opens the same screen on /dashboard/screener.

import { getScreenerStats, runScreenerPage } from '@/lib/dashboard/screener';
import {
  buildScreenerQuery,
  type RangeFieldKey,
  type ScreenerFilters,
  type ScreenerResultRow,
} from '@/lib/dashboard/screenerSchema';

export const MODEL_RESULT_LIMIT = 20;

/** Fields that only exist for companies whose Screener.in fundamentals have
 * been scraped — filtering/sorting on them silently narrows the universe. */
const FUNDAMENTAL_FIELDS: readonly RangeFieldKey[] = [
  'roe',
  'roce',
  'debt_to_equity',
  'sales_growth_3y_cagr',
  'profit_growth_3y_cagr',
];

export function usesFundamentals(filters: ScreenerFilters): boolean {
  if (filters.sector || filters.industry) return true;
  if (filters.sort_by && FUNDAMENTAL_FIELDS.includes(filters.sort_by)) return true;
  return FUNDAMENTAL_FIELDS.some(
    (f) => filters[`${f}_min`] !== undefined || filters[`${f}_max`] !== undefined,
  );
}

/** `/dashboard/screener?...` showing exactly these filters. Paging is dropped
 * (the page starts at 1); an empty filter set still carries a sort so the page
 * shows the whole market instead of its default preset. */
export function screenerUrl(filters: ScreenerFilters): string {
  const { limit: _limit, offset: _offset, ...rest } = filters;
  void _limit;
  void _offset;
  const query = buildScreenerQuery(Object.keys(rest).length > 0 ? rest : { sort_by: 'market_cap' });
  return `/dashboard/screener?${query}`;
}

export interface CompactScreenRow {
  symbol: string;
  name: string;
  sector: string | null;
  market_cap_cr: number | null;
  price: number | null;
  pe: number | null;
  pb: number | null;
  roe_pct: number | null;
  roce_pct: number | null;
  dividend_yield_pct: number | null;
  debt_to_equity: number | null;
  sales_growth_3y_cagr_pct: number | null;
  profit_growth_3y_cagr_pct: number | null;
}

function compact(row: ScreenerResultRow): CompactScreenRow {
  return {
    symbol: row.symbol,
    name: row.name,
    sector: row.sector,
    market_cap_cr: row.market_cap === null ? null : Math.round(row.market_cap),
    price: row.current_price,
    pe: row.pe,
    pb: row.pb,
    roe_pct: row.roe,
    roce_pct: row.roce,
    dividend_yield_pct: row.dividend_yield,
    debt_to_equity: row.debt_to_equity,
    sales_growth_3y_cagr_pct: row.sales_growth_3y_cagr,
    profit_growth_3y_cagr_pct: row.profit_growth_3y_cagr,
  };
}

export interface ScreenForModel {
  /** All companies matching, not just those returned. */
  count: number;
  results: CompactScreenRow[];
  truncated: boolean;
  appliedFilters: ScreenerFilters;
  /** Present when the screen uses scraped-fundamentals fields. */
  coverage?: { companiesWithFundamentals: number; universe: number; note: string };
  /** Set when nothing matched, to steer the next attempt. */
  hint?: string;
}

export async function screenForModel(
  filters: ScreenerFilters,
  limit: number = MODEL_RESULT_LIMIT,
): Promise<ScreenForModel> {
  const { limit: _limit, offset: _offset, ...applied } = filters;
  void _limit;
  void _offset;
  const [page, stats] = await Promise.all([
    runScreenerPage({ ...applied, limit, offset: 0 }),
    usesFundamentals(applied) ? getScreenerStats() : Promise.resolve(null),
  ]);
  const out: ScreenForModel = {
    count: page.total,
    results: page.rows.map(compact),
    truncated: page.total > page.rows.length,
    appliedFilters: applied,
  };
  if (page.total === 0) {
    out.hint =
      applied.sector || applied.industry
        ? 'No matches. If you guessed the sector/industry name, check the exact names with get_screener_options; otherwise loosen the least important bound.'
        : 'No matches. Loosen the least important bound.';
  }
  if (stats) {
    out.coverage = {
      companiesWithFundamentals: stats.with_fundamentals,
      universe: stats.universe,
      note:
        stats.with_fundamentals < stats.universe
          ? 'ROE/ROCE/debt/growth/sector filters only match companies whose fundamentals have been scraped so far, so some qualifying companies may be missing.'
          : 'Fundamentals are available for the whole universe.',
    };
  }
  return out;
}
