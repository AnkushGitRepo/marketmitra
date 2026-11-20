// The Funds filter panel edits strings (so a half-typed "1." is not an error);
// this module turns them into validated FundFilters and back, and describes the
// active filters as chips. Pure, so it tests without a browser.

import { boundError, buildFundsQuery, parseDecimal, type FundFilters } from './params';

export const TEXT_DRAFT_KEYS = ['q', 'category', 'sub_category', 'fund_house'] as const;
export const NUMBER_DRAFT_KEYS = [
  'min_ret_1y', 'min_ret_3y', 'min_ret_5y', 'max_expense_ratio', 'max_std_dev_3y', 'max_fall_3y', 'min_sharpe_3y',
] as const;
export type DraftKey = (typeof TEXT_DRAFT_KEYS)[number] | (typeof NUMBER_DRAFT_KEYS)[number];
export type Draft = Record<DraftKey, string>;

export const EMPTY_DRAFT: Draft = {
  q: '', category: '', sub_category: '', fund_house: '',
  min_ret_1y: '', min_ret_3y: '', min_ret_5y: '', max_expense_ratio: '', max_std_dev_3y: '', max_fall_3y: '', min_sharpe_3y: '',
};

const NUMBER_LABELS: Record<(typeof NUMBER_DRAFT_KEYS)[number], string> = {
  min_ret_1y: 'Minimum 1Y return',
  min_ret_3y: 'Minimum 3Y return',
  min_ret_5y: 'Minimum 5Y return',
  max_expense_ratio: 'Maximum expense ratio',
  max_std_dev_3y: 'Maximum volatility',
  max_fall_3y: 'Maximum worst fall',
  min_sharpe_3y: 'Minimum Sharpe ratio',
};

export function draftFromFilters(filters: FundFilters): Draft {
  const draft: Draft = { ...EMPTY_DRAFT };
  for (const key of TEXT_DRAFT_KEYS) draft[key] = filters[key] ?? '';
  for (const key of NUMBER_DRAFT_KEYS) {
    const value = filters[key];
    draft[key] = value === undefined ? '' : String(value);
  }
  return draft;
}

export type BuiltFilters = { ok: true; filters: FundFilters } | { ok: false; error: string };

/**
 * Draft -> filters. Sort, order and plan carry over from `base` (the applied
 * filters); paging is dropped so any change returns to the first page.
 * `subCategories` (category -> options) clears a sub-category that no longer fits.
 */
export function filtersFromDraft(
  draft: Draft,
  base: FundFilters,
  subCategories: Record<string, string[]> = {},
): BuiltFilters {
  const filters: FundFilters = {};
  if (base.sort) filters.sort = base.sort;
  if (base.order) filters.order = base.order;
  if (base.plan) filters.plan = base.plan;
  // Applied by a shared link or the API but not editable in the panel: carry them so an edit does not drop them silently.
  if (base.option) filters.option = base.option;
  if (base.min_aum_cr !== undefined) filters.min_aum_cr = base.min_aum_cr;

  for (const key of TEXT_DRAFT_KEYS) {
    const value = draft[key].trim();
    if (value) filters[key] = value;
  }
  const allowed = filters.category ? subCategories[filters.category] : undefined;
  if (filters.sub_category && allowed && !allowed.includes(filters.sub_category)) delete filters.sub_category;

  for (const key of NUMBER_DRAFT_KEYS) {
    const raw = draft[key].trim();
    if (!raw) continue;
    const num = parseDecimal(raw);
    if (num === null) return { ok: false, error: `${NUMBER_LABELS[key]} must be a plain number, like 12 or 0.5.` };
    if (boundError(key, num)) return { ok: false, error: `${NUMBER_LABELS[key]} is out of range.` };
    filters[key] = num;
  }
  return { ok: true, filters };
}

export interface FilterChip {
  readonly label: string;
  readonly keys: readonly (keyof FundFilters)[];
}

export function describeFilters(filters: FundFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.q) chips.push({ label: `“${filters.q}”`, keys: ['q'] });
  if (filters.category) chips.push({ label: filters.category, keys: ['category', 'sub_category'] });
  if (filters.sub_category) chips.push({ label: filters.sub_category, keys: ['sub_category'] });
  if (filters.fund_house) chips.push({ label: filters.fund_house.replace(/ Mutual Fund$/, ''), keys: ['fund_house'] });
  if (filters.plan === 'regular') chips.push({ label: 'Regular plan', keys: ['plan'] });
  if (filters.option && filters.option !== 'growth') chips.push({ label: filters.option === 'idcw' ? 'IDCW option' : 'Other option', keys: ['option'] });
  if (filters.min_aum_cr !== undefined) chips.push({ label: `AUM ≥ ₹${filters.min_aum_cr} Cr`, keys: ['min_aum_cr'] });
  if (filters.min_ret_1y !== undefined) chips.push({ label: `1Y return ≥ ${filters.min_ret_1y}%`, keys: ['min_ret_1y'] });
  if (filters.min_ret_3y !== undefined) chips.push({ label: `3Y return ≥ ${filters.min_ret_3y}%`, keys: ['min_ret_3y'] });
  if (filters.min_ret_5y !== undefined) chips.push({ label: `5Y return ≥ ${filters.min_ret_5y}%`, keys: ['min_ret_5y'] });
  if (filters.max_expense_ratio !== undefined) chips.push({ label: `Expense ratio ≤ ${filters.max_expense_ratio}%`, keys: ['max_expense_ratio'] });
  if (filters.max_std_dev_3y !== undefined) chips.push({ label: `Volatility ≤ ${filters.max_std_dev_3y}%`, keys: ['max_std_dev_3y'] });
  if (filters.max_fall_3y !== undefined) chips.push({ label: `Worst fall ≤ ${filters.max_fall_3y}%`, keys: ['max_fall_3y'] });
  if (filters.min_sharpe_3y !== undefined) chips.push({ label: `Sharpe ≥ ${filters.min_sharpe_3y}`, keys: ['min_sharpe_3y'] });
  return chips;
}

/** Sub-category options for the dropdown: one category's, or every distinct one when none is chosen. */
export function subCategoryOptions(subCategories: Record<string, string[]>, category: string): string[] {
  const list = category ? (subCategories[category] ?? []) : Object.values(subCategories).flat();
  return [...new Set(list)].sort((a, b) => a.localeCompare(b));
}

/** A stable string for "are these the same filters?": key order and paging do not matter. */
export function canonicalQuery(filters: FundFilters): string {
  const sorted = Object.fromEntries(
    Object.entries(filters)
      .filter(([key]) => key !== 'limit' && key !== 'offset')
      .sort(([a], [b]) => a.localeCompare(b)),
  ) as FundFilters;
  return buildFundsQuery(sorted);
}
