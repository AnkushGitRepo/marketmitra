// One-click screens and the grouping of range filters in the filter panel.
// Field labels/units are NOT repeated here — they come from RANGE_FIELD_DEFS
// via SCREENER_RANGE_FIELDS — so renaming a field can't leave a stale label.

import type { RangeFieldKey, ScreenerFilters } from '@/lib/dashboard/screenerSchema';

export interface ScreenerPreset {
  id: string;
  label: string;
  description: string;
  filters: ScreenerFilters;
  /** True when the screen needs scraped fundamentals (ROE, ROCE, growth, debt). */
  needsFundamentals: boolean;
}

export const SCREENER_PRESETS: readonly ScreenerPreset[] = [
  {
    id: 'quality',
    label: 'Quality compounders',
    description: 'ROE and ROCE above 15%, debt/equity under 0.5',
    filters: { roe_min: 15, roce_min: 15, debt_to_equity_max: 0.5, sort_by: 'roe' },
    needsFundamentals: true,
  },
  {
    id: 'value',
    label: 'Value picks',
    description: 'P/E under 15 and P/B under 2, profitable',
    filters: { pe_min: 1, pe_max: 15, pb_max: 2, sort_by: 'pe', order: 'asc' },
    needsFundamentals: false,
  },
  {
    id: 'dividend',
    label: 'Dividend payers',
    description: 'Dividend yield above 3%',
    filters: { dividend_yield_min: 3, sort_by: 'dividend_yield' },
    needsFundamentals: false,
  },
  {
    id: 'growth',
    label: 'High growth',
    description: 'Sales and profit growing above 20% a year (3y CAGR)',
    filters: {
      sales_growth_3y_cagr_min: 20,
      profit_growth_3y_cagr_min: 20,
      sort_by: 'profit_growth_3y_cagr',
    },
    needsFundamentals: true,
  },
  {
    id: 'debt-free',
    label: 'Low debt',
    description: 'Debt/equity under 0.1 with ROE above 10%',
    filters: { debt_to_equity_max: 0.1, roe_min: 10, sort_by: 'roe' },
    needsFundamentals: true,
  },
  {
    id: 'large-cap',
    label: 'Large caps',
    description: 'Market cap above ₹50,000 Cr',
    filters: { market_cap_min: 50000, sort_by: 'market_cap' },
    needsFundamentals: false,
  },
  {
    id: 'small-cap',
    label: 'Small caps',
    description: 'Market cap between ₹500 Cr and ₹5,000 Cr',
    filters: { market_cap_min: 500, market_cap_max: 5000, sort_by: 'market_cap' },
    needsFundamentals: false,
  },
];

export interface FilterGroup {
  title: string;
  fields: readonly RangeFieldKey[];
}

export const FILTER_GROUPS: readonly FilterGroup[] = [
  { title: 'Size', fields: ['market_cap'] },
  { title: 'Valuation', fields: ['pe', 'pb', 'dividend_yield'] },
  { title: 'Profitability & leverage', fields: ['roe', 'roce', 'debt_to_equity'] },
  { title: 'Growth', fields: ['sales_growth_3y_cagr', 'profit_growth_3y_cagr'] },
];
