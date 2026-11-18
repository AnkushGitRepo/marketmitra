import { describe, expect, it } from 'vitest';
import { canonicalQuery, describeFilters, draftFromFilters, filtersFromDraft, subCategoryOptions, EMPTY_DRAFT } from './draft';

describe('draftFromFilters / filtersFromDraft', () => {
  it('round-trips filters through string inputs', () => {
    const base = { sort: 'ret_3y' as const, order: 'desc' as const, plan: 'direct' as const };
    const draft = draftFromFilters({ ...base, q: 'nifty', category: 'Equity', min_ret_3y: 12.5, max_expense_ratio: 0.8 });
    expect(draft.min_ret_3y).toBe('12.5');
    expect(filtersFromDraft(draft, base)).toEqual({
      ok: true,
      filters: { ...base, q: 'nifty', category: 'Equity', min_ret_3y: 12.5, max_expense_ratio: 0.8 },
    });
  });

  it('drops empty inputs and trims text', () => {
    const r = filtersFromDraft({ ...EMPTY_DRAFT, q: '  flexi  ', min_ret_3y: '' }, {});
    expect(r).toEqual({ ok: true, filters: { q: 'flexi' } });
  });

  it('reports a non-numeric input by name instead of querying', () => {
    const r = filtersFromDraft({ ...EMPTY_DRAFT, min_sharpe_3y: 'abc' }, {});
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Sharpe/i);
  });

  it('keeps sort and plan from the applied filters, and resets paging', () => {
    const r = filtersFromDraft(EMPTY_DRAFT, { sort: 'sharpe_3y', order: 'asc', plan: 'regular', offset: 100, limit: 25 });
    expect(r).toEqual({ ok: true, filters: { sort: 'sharpe_3y', order: 'asc', plan: 'regular' } });
  });

  it('clears the sub-category when its category no longer contains it', () => {
    const r = filtersFromDraft({ ...EMPTY_DRAFT, category: 'Debt', sub_category: 'Flexi Cap Fund' }, {}, { Debt: ['Liquid Fund'] });
    expect(r).toEqual({ ok: true, filters: { category: 'Debt' } });
  });
});

describe('describeFilters', () => {
  it('lists active filters as removable chips, skipping sort/paging/plan defaults', () => {
    const chips = describeFilters({ category: 'Equity', min_ret_3y: 15, max_expense_ratio: 1, sort: 'ret_3y', plan: 'direct' });
    expect(chips.map((c) => c.label)).toEqual(['Equity', '3Y return ≥ 15%', 'Expense ratio ≤ 1%']);
    expect(chips[1]?.keys).toEqual(['min_ret_3y']);
  });

  it('shows the Regular plan, since Direct is the default', () => {
    expect(describeFilters({ plan: 'regular' }).map((c) => c.label)).toEqual(['Regular plan']);
  });
});

describe('subCategoryOptions', () => {
  const subs = { Equity: ['Sectoral Fund', 'Flexi Cap Fund'], Debt: ['Sectoral Fund', 'Liquid Fund'] };

  it("lists one category's options, sorted", () => {
    expect(subCategoryOptions(subs, 'Equity')).toEqual(['Flexi Cap Fund', 'Sectoral Fund']);
    expect(subCategoryOptions(subs, 'Nope')).toEqual([]);
  });

  it('lists each distinct sub-category once when no category is chosen (no duplicate dropdown keys)', () => {
    const all = subCategoryOptions(subs, '');
    expect(all).toEqual(['Flexi Cap Fund', 'Liquid Fund', 'Sectoral Fund']);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('inputs the panel cannot edit', () => {
  it('keeps min_aum_cr and option from the applied filters instead of dropping them on the next edit', () => {
    const r = filtersFromDraft({ ...EMPTY_DRAFT, q: 'x' }, { min_aum_cr: 500, option: 'idcw', sort: 'ret_3y' });
    expect(r).toEqual({ ok: true, filters: { min_aum_cr: 500, option: 'idcw', sort: 'ret_3y', q: 'x' } });
  });

  it('shows them as chips so the user can see and remove them', () => {
    const labels = describeFilters({ min_aum_cr: 500, option: 'idcw' }).map((c) => c.label);
    expect(labels).toEqual(['IDCW option', 'AUM ≥ ₹500 Cr']);
  });

  it('rejects an out-of-range number in the panel by name', () => {
    const r = filtersFromDraft({ ...EMPTY_DRAFT, max_expense_ratio: '15' }, {});
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/expense ratio/i);
  });

  it('rejects text that is not a plain decimal', () => {
    expect(filtersFromDraft({ ...EMPTY_DRAFT, min_ret_3y: '0x10' }, {}).ok).toBe(false);
    expect(filtersFromDraft({ ...EMPTY_DRAFT, min_ret_3y: '1e2' }, {}).ok).toBe(false);
  });
});

describe('canonicalQuery', () => {
  it('is the same whatever order the filters were built in', () => {
    expect(canonicalQuery({ plan: 'direct', sort: 'ret_3y', q: 'a' })).toBe(canonicalQuery({ q: 'a', sort: 'ret_3y', plan: 'direct' }));
  });

  it('ignores paging', () => {
    expect(canonicalQuery({ q: 'a', limit: 50, offset: 100 })).toBe(canonicalQuery({ q: 'a' }));
  });
});
