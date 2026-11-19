// Shapes returned by services/fundamentals-api `/funds` (ADR 0068). Every metric
// can be null: null means "not enough history" or "not disclosed", never zero.

export interface FundSummary {
  scheme_code: number;
  name: string;
  base_name: string;
  fund_house: string;
  category: string;
  sub_category: string | null;
  plan: string;
  option: string;
  nav: number | null;
  nav_date: string | null;
  ret_1m: number | null;
  ret_3m: number | null;
  ret_6m: number | null;
  ret_1y: number | null;
  ret_3y: number | null;
  ret_5y: number | null;
  ret_10y: number | null;
  std_dev_3y: number | null;
  sharpe_3y: number | null;
  sortino_3y: number | null;
  max_drawdown_3y: number | null;
  sip_xirr_3y: number | null;
  sip_xirr_5y: number | null;
  expense_ratio: number | null;
  aum_cr: number | null;
}

export interface FundPage {
  total: number;
  limit: number;
  offset: number;
  items: FundSummary[];
}

export interface FundFactsheet {
  expense_ratio: number | null;
  aum_cr: number | null;
  exit_load: string | null;
  fund_manager: string | null;
  benchmark: string | null;
  launch_date: string | null;
  as_of: string | null;
  source: string;
}

export interface FundDetail extends FundSummary {
  scheme_type: string;
  isin_growth: string | null;
  isin_reinvest: string | null;
  is_active: boolean;
  metrics_as_of: string | null;
  factsheet: FundFactsheet | null;
}

export interface NavPoint {
  date: string;
  nav: number;
}

export interface FundFacets {
  categories: string[];
  sub_categories: Record<string, string[]>;
  fund_houses: string[];
  nav_as_of: string | null;
}

export const NAV_RANGES = ['1m', '6m', '1y', '3y', '5y', '10y', 'max'] as const;
export type NavRange = (typeof NAV_RANGES)[number];

export const MIN_SCHEME_CODE = 1;
export const MAX_SCHEME_CODE = 2_147_483_647;

/** A scheme code from a URL: a positive int32, anything else is not a fund. */
export function parseSchemeCode(raw: string): number | null {
  if (!/^\d{1,10}$/.test(raw)) return null;
  const code = Number(raw);
  return code >= MIN_SCHEME_CODE && code <= MAX_SCHEME_CODE ? code : null;
}
