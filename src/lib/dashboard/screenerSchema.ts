// The Screener feature's shared filter contract (ADR 0025) — the single
// explicit schema both the Screener page's filter panel and Mitra's
// run_screener tool consume, so Mitra can never express a filter the UI
// itself can't represent. v1 is fixed-field min/max + sector-equality only
// — no custom query/expression builder (a deliberate later-phase boundary,
// see the ADR).
//
// RANGE_FIELD_DEFS is the single source of truth for every numeric filter:
// the UI's field list and the zod schema's `<key>_min`/`<key>_max` shape
// are both derived from this one array (via a mapped type keyed off its
// literal `key`s), so there's no second place to keep in sync by hand.

import { z } from 'zod';

const RANGE_FIELD_DEFS = [
  { key: 'market_cap', label: 'Market cap', unit: '₹ Cr' },
  { key: 'pe', label: 'P/E ratio' },
  { key: 'pb', label: 'P/B ratio' },
  { key: 'roe', label: 'ROE', unit: '%' },
  { key: 'roce', label: 'ROCE', unit: '%' },
  { key: 'dividend_yield', label: 'Dividend yield', unit: '%' },
  { key: 'debt_to_equity', label: 'Debt/Equity' },
  { key: 'sales_growth_3y_cagr', label: 'Sales growth (3y CAGR)', unit: '%' },
  { key: 'profit_growth_3y_cagr', label: 'Profit growth (3y CAGR)', unit: '%' },
] as const satisfies readonly { key: string; label: string; unit?: string }[];

export type RangeFieldKey = (typeof RANGE_FIELD_DEFS)[number]['key'];

export interface ScreenerRangeField {
  key: RangeFieldKey;
  label: string;
  type: 'range';
  unit?: string;
}

export interface ScreenerSelectField {
  key: 'sector';
  label: string;
  type: 'select';
  /** Options aren't hardcoded here — Screener.in's actual sector strings
   * shouldn't be hand-maintained and drift from reality. Resolved at
   * request time from GET /api/screener/facets. */
  optionsSource: 'sectors' | 'industries';
}

export type ScreenerField = ScreenerRangeField | ScreenerSelectField;

export const SCREENER_RANGE_FIELDS: ScreenerRangeField[] = RANGE_FIELD_DEFS.map((f) => ({
  ...f,
  type: 'range' as const,
}));

export const SCREENER_FIELDS: ScreenerField[] = [
  ...SCREENER_RANGE_FIELDS,
  { key: 'sector', label: 'Sector', type: 'select', optionsSource: 'sectors' },
];

// Every percentage-shaped field (ROE, ROCE, Dividend Yield, and the two
// growth CAGRs) is stored and returned as a raw percentage number (14.4
// meaning 14.4%), never a 0-1 fraction — a deliberate consistency decision
// (see the CAGR computation's own comment in scraper.py) so no layer here
// needs to special-case which fields are "already ×100."

type RangeShape = {
  [K in RangeFieldKey as `${K}_min` | `${K}_max`]: z.ZodOptional<z.ZodNumber>;
};

const rangeShape = Object.fromEntries(
  RANGE_FIELD_DEFS.flatMap((f) => [
    [`${f.key}_min`, z.number().optional()],
    [`${f.key}_max`, z.number().optional()],
  ])
) as RangeShape;

export const screenerFiltersSchema = z.object({
  ...rangeShape,
  sector: z.string().trim().min(1).optional(),
  industry: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type ScreenerFilters = z.infer<typeof screenerFiltersSchema>;
