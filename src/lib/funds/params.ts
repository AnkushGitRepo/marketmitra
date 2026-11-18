// One parser for mutual fund query strings, shared by GET /api/funds and the
// /funds page's URL-synced filter state, so both accept exactly the same
// inputs. Defaults (Direct plan, Growth option) are applied by the data
// service, not here, so a bare link means the same thing everywhere.

export const FUND_SORT_KEYS = [
  'ret_1m', 'ret_3m', 'ret_6m', 'ret_1y', 'ret_3y', 'ret_5y', 'ret_10y',
  'std_dev_3y', 'sharpe_3y', 'sortino_3y', 'max_drawdown_3y', 'sip_xirr_3y', 'sip_xirr_5y',
  'expense_ratio', 'aum_cr', 'name', 'nav',
] as const;
export type FundSortKey = (typeof FUND_SORT_KEYS)[number];

export type FundPlan = 'direct' | 'regular';
export type FundOption = 'growth' | 'idcw' | 'other';

export const MAX_FUND_PAGE_SIZE = 200;
const MAX_TEXT = { q: 80, category: 32, sub_category: 96, fund_house: 160 } as const;

export const NUMERIC_KEYS = [
  'min_ret_1y', 'min_ret_3y', 'min_ret_5y', 'max_expense_ratio',
  'min_aum_cr', 'max_std_dev_3y', 'min_sharpe_3y',
] as const;
export type NumericKey = (typeof NUMERIC_KEYS)[number];

/** The data service rejects values outside these (422), so reject them here first, as a 400 the caller can act on. */
export const NUMBER_BOUNDS: Readonly<Record<NumericKey, { readonly min: number; readonly max: number }>> = {
  min_ret_1y: { min: -100, max: 1000 },
  min_ret_3y: { min: -100, max: 1000 },
  min_ret_5y: { min: -100, max: 1000 },
  max_expense_ratio: { min: 0, max: 10 },
  min_aum_cr: { min: 0, max: Number.MAX_SAFE_INTEGER },
  max_std_dev_3y: { min: 0, max: 500 },
  min_sharpe_3y: { min: -20, max: 20 },
};
export const MAX_FUND_OFFSET = 100_000;

const DECIMAL = /^-?(\d+\.?\d*|\.\d+)$/;

/** A plain decimal ("12", "-3.5", ".5"). Not hex, exponent, comma or blank, which `Number()` would accept as something else. */
export function parseDecimal(raw: string): number | null {
  const text = raw.trim();
  if (!DECIMAL.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** An error message when `value` is outside the key's allowed range, else null. */
export function boundError(key: NumericKey, value: number): string | null {
  const { min, max } = NUMBER_BOUNDS[key];
  if (value >= min && value <= max) return null;
  return max === Number.MAX_SAFE_INTEGER ? `${key} must be at least ${min}, got ${value}` : `${key} must be between ${min} and ${max}, got ${value}`;
}

export interface FundFilters {
  q?: string;
  category?: string;
  sub_category?: string;
  fund_house?: string;
  plan?: FundPlan;
  option?: FundOption;
  min_ret_1y?: number;
  min_ret_3y?: number;
  min_ret_5y?: number;
  max_expense_ratio?: number;
  min_aum_cr?: number;
  max_std_dev_3y?: number;
  min_sharpe_3y?: number;
  sort?: FundSortKey;
  order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type ParsedFundFilters = { ok: true; filters: FundFilters } | { ok: false; message: string };

type ParamSource = Pick<URLSearchParams, 'get'>;

const PLANS: readonly string[] = ['direct', 'regular'];
const OPTIONS: readonly string[] = ['growth', 'idcw', 'other'];

function parseInteger(raw: string, key: string, min: number): number | string {
  const num = Number(raw);
  return Number.isInteger(num) && num >= min ? num : `${key} must be an integer >= ${min}, got "${raw}"`;
}

export function parseFundParams(params: ParamSource): ParsedFundFilters {
  const filters: FundFilters = {};

  for (const key of Object.keys(MAX_TEXT) as (keyof typeof MAX_TEXT)[]) {
    const raw = params.get(key)?.trim();
    if (raw) filters[key] = raw.slice(0, MAX_TEXT[key]);
  }

  const plan = params.get('plan');
  if (plan) {
    if (!PLANS.includes(plan)) return { ok: false, message: `plan must be direct or regular, got "${plan}"` };
    filters.plan = plan as FundPlan;
  }
  const option = params.get('option');
  if (option) {
    if (!OPTIONS.includes(option)) return { ok: false, message: `option must be growth, idcw or other, got "${option}"` };
    filters.option = option as FundOption;
  }

  for (const key of NUMERIC_KEYS) {
    const raw = params.get(key);
    if (raw === null || raw === '') continue;
    const num = parseDecimal(raw);
    if (num === null) return { ok: false, message: `${key} must be a number, got "${raw.slice(0, 20)}"` };
    const outOfRange = boundError(key, num);
    if (outOfRange) return { ok: false, message: outOfRange };
    filters[key] = num;
  }

  const sort = params.get('sort');
  if (sort) {
    if (!(FUND_SORT_KEYS as readonly string[]).includes(sort)) {
      return { ok: false, message: `sort must be one of ${FUND_SORT_KEYS.join(', ')}` };
    }
    filters.sort = sort as FundSortKey;
  }
  const order = params.get('order');
  if (order) {
    if (order !== 'asc' && order !== 'desc') return { ok: false, message: `order must be asc or desc, got "${order}"` };
    filters.order = order;
  }

  const limit = params.get('limit');
  if (limit) {
    const n = parseInteger(limit, 'limit', 1);
    if (typeof n === 'string') return { ok: false, message: n };
    filters.limit = Math.min(n, MAX_FUND_PAGE_SIZE);
  }
  const offset = params.get('offset');
  if (offset) {
    const n = parseInteger(offset, 'offset', 0);
    if (typeof n === 'string') return { ok: false, message: n };
    if (n > MAX_FUND_OFFSET) return { ok: false, message: `offset must be at most ${MAX_FUND_OFFSET}, got ${n}` };
    filters.offset = n;
  }

  return { ok: true, filters };
}

export function buildFundsQuery(filters: FundFilters): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') qs.set(key, String(value));
  }
  return qs.toString();
}
