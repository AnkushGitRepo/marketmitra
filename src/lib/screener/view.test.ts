import { describe, expect, it } from 'vitest';
import { RESULT_COLUMNS, formatNum } from './columns';
import {
  CARD_METRIC_COUNT,
  SORT_OPTIONS,
  activeFilterCount,
  cardMetricKeys,
  filteredFieldKeys,
  highlightedKeys,
  orderColumns,
  parseSortValue,
  sortValueOf,
} from './view';

describe('filteredFieldKeys / highlightedKeys', () => {
  it('lists fields with any bound, in field order, ignoring sector and q', () => {
    expect(filteredFieldKeys({ debt_to_equity_max: 1, roe_min: 15, sector: 'IT', q: 'tata' })).toEqual(['roe', 'debt_to_equity']);
  });

  it('adds the sorted field to the highlight set', () => {
    expect([...highlightedKeys({ roe_min: 15, sort_by: 'pe' })].sort()).toEqual(['pe', 'roe']);
  });
});

describe('orderColumns', () => {
  it('moves highlighted columns first without reordering either group or mutating the input', () => {
    const cols = RESULT_COLUMNS;
    const before = cols.map((c) => c.key);
    const ordered = orderColumns(cols, new Set(['debt_to_equity', 'roe']));
    expect(ordered.slice(0, 2).map((c) => c.key)).toEqual(['roe', 'debt_to_equity']);
    expect(ordered.slice(2).map((c) => c.key)).toEqual(before.filter((k) => k !== 'roe' && k !== 'debt_to_equity'));
    expect(cols.map((c) => c.key)).toEqual(before);
  });

  it('is a plain copy when nothing is highlighted', () => {
    expect(orderColumns(RESULT_COLUMNS, new Set()).map((c) => c.key)).toEqual(RESULT_COLUMNS.map((c) => c.key));
  });
});

describe('cardMetricKeys', () => {
  it('shows the defaults when nothing is screened', () => {
    expect(cardMetricKeys({})).toEqual(['market_cap', 'pe', 'roe', 'debt_to_equity']);
  });

  it('puts screened fields first, then fills from the defaults without repeats', () => {
    expect(cardMetricKeys({ roe_min: 15, debt_to_equity_max: 1 })).toEqual(['roe', 'debt_to_equity', 'market_cap', 'pe']);
  });

  it('caps at four even when more fields are filtered', () => {
    const keys = cardMetricKeys({ roe_min: 1, roce_min: 1, pe_max: 1, pb_max: 1, dividend_yield_min: 1 });
    expect(keys).toHaveLength(CARD_METRIC_COUNT);
    expect(new Set(keys).size).toBe(CARD_METRIC_COUNT);
  });

  it('includes the sorted field after the filtered ones', () => {
    expect(cardMetricKeys({ pe_max: 15, sort_by: 'dividend_yield' }).slice(0, 2)).toEqual(['pe', 'dividend_yield']);
  });
});

describe('activeFilterCount', () => {
  it('counts the chips the page shows (search, sector, industry, each range)', () => {
    expect(activeFilterCount({ roe_min: 15, debt_to_equity_max: 1, sector: 'IT', sort_by: 'roe' })).toBe(3);
    expect(activeFilterCount({ sort_by: 'market_cap' })).toBe(0);
  });
});

describe('sort options', () => {
  it('offers both directions for every filterable field and round-trips', () => {
    expect(SORT_OPTIONS.length).toBe(18);
    for (const o of SORT_OPTIONS) {
      const parsed = parseSortValue(o.value);
      expect(parsed).not.toBeNull();
      expect(sortValueOf(parsed!)).toBe(o.value);
    }
  });

  it('defaults to market cap, high to low', () => {
    expect(sortValueOf({})).toBe('market_cap:desc');
  });

  it('rejects unknown fields and directions', () => {
    expect(parseSortValue('nope:desc')).toBeNull();
    expect(parseSortValue('roe:sideways')).toBeNull();
    expect(parseSortValue('')).toBeNull();
  });
});

describe('formatNum', () => {
  it('formats with Indian grouping and shows a dash for missing values, never zero', () => {
    expect(formatNum(1234567.891, { digits: 0 })).toBe('12,34,568');
    expect(formatNum(null)).toBe('—');
    expect(formatNum(0, { suffix: '%' })).toBe('0%');
  });
});
