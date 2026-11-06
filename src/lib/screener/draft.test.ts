import { describe, expect, it } from 'vitest';
import { buildFilters, describeFilters, draftFromFilters, withoutKeys } from './draft';

describe('draft round trip', () => {
  it('builds numbers, text filters and keeps the sort', () => {
    const draft = draftFromFilters({ roe_min: 15, sector: 'Capital Goods', q: 'bharat' });
    expect(draft.roe_min).toBe('15');
    expect(buildFilters(draft, { sort_by: 'roe', order: 'asc' })).toEqual({
      ok: true,
      filters: { roe_min: 15, sector: 'Capital Goods', q: 'bharat', sort_by: 'roe', order: 'asc' },
    });
  });

  it('rejects min above max and non-numbers', () => {
    const base = draftFromFilters({});
    expect(buildFilters({ ...base, pe_min: '30', pe_max: '10' }, {}).ok).toBe(false);
    expect(buildFilters({ ...base, roe_min: 'abc' }, {}).ok).toBe(false);
  });
});

describe('describeFilters / withoutKeys', () => {
  it('describes one-sided and two-sided ranges with units', () => {
    const labels = describeFilters({
      roe_min: 15,
      market_cap_min: 500,
      market_cap_max: 5000,
      pe_max: 20,
    }).map((c) => c.label);
    expect(labels).toContain('ROE ≥ 15%');
    expect(labels).toContain('Market cap ₹500 Cr – ₹5,000 Cr');
    expect(labels).toContain('P/E ratio ≤ 20');
  });

  it('removing a sector chip also clears its industry', () => {
    const chip = describeFilters({ sector: 'IT', industry: 'Software' }).find(
      (c) => c.id === 'sector',
    );
    expect(withoutKeys({ sector: 'IT', industry: 'Software', roe_min: 5 }, chip!.keys)).toEqual({
      roe_min: 5,
    });
  });
});
