import { describe, expect, it } from 'vitest';
import { activeLens, lensFilters, LENSES } from './lenses';
import { buildFundsQuery, parseFundParams } from './params';

const byId = (id: string) => LENSES.find((l) => l.id === id)!;

describe('LENSES', () => {
  it('has four lenses with distinct ids and labels', () => {
    expect(LENSES.map((l) => l.id)).toEqual(['core', 'quality', 'steady', 'tax']);
    expect(new Set(LENSES.map((l) => l.label)).size).toBe(4);
  });

  it.each(LENSES.map((l) => [l.id, l] as const))('%s is a filter the API accepts, unchanged by a round trip', (_id, lens) => {
    const parsed = parseFundParams(new URLSearchParams(buildFundsQuery(lensFilters(lens, {}))));
    expect(parsed).toEqual({ ok: true, filters: lensFilters(lens, {}) });
  });

  it('uses the thresholds written in the issue', () => {
    expect(byId('core').filters).toMatchObject({ q: 'index', max_expense_ratio: 0.5 });
    expect(byId('quality').filters).toMatchObject({ min_sharpe_3y: 1.1, min_ret_3y: 18 });
    expect(byId('steady').filters).toMatchObject({ max_std_dev_3y: 14, max_fall_3y: 15 });
  });

  it('the two risk lenses show diversified funds, so sector funds do not crowd the short list', () => {
    expect(byId('quality').filters.exclude_thematic).toBe(true);
    expect(byId('steady').filters.exclude_thematic).toBe(true);
    expect(byId('core').filters.exclude_thematic).toBeUndefined();
    expect(byId('tax').filters.exclude_thematic).toBeUndefined();
    expect(byId('tax').filters).toMatchObject({ sub_category: 'ELSS Tax Saver Fund' });
  });

  it('describes each lens with its rule, so nothing is a black box', () => {
    for (const lens of LENSES) expect(lens.rule.length).toBeGreaterThan(10);
  });
});

describe('lensFilters', () => {
  it('replaces the earlier filters but keeps the chosen plan', () => {
    const out = lensFilters(byId('quality'), { q: 'flexi', category: 'Equity', min_ret_1y: 5, plan: 'regular', limit: 50, offset: 100 });
    expect(out.plan).toBe('regular');
    expect(out.q).toBeUndefined();
    expect(out.category).toBeUndefined();
    expect(out.min_ret_1y).toBeUndefined();
    expect(out.offset).toBeUndefined();
    expect(out.min_sharpe_3y).toBe(1.1);
  });

  it('defaults to the direct plan', () => {
    expect(lensFilters(byId('tax'), {}).plan).toBe('direct');
  });

  it('does not change the lens or the filters it is given', () => {
    const base = { q: 'x', plan: 'regular' as const };
    const before = JSON.stringify([LENSES, base]);
    lensFilters(byId('core'), base);
    expect(JSON.stringify([LENSES, base])).toBe(before);
  });
});

describe('activeLens', () => {
  it('recognises a lens whatever the plan and paging', () => {
    expect(activeLens({ ...lensFilters(byId('steady'), {}), plan: 'regular', limit: 25, offset: 50 })).toBe('steady');
  });

  it('is null once the screen is changed', () => {
    expect(activeLens({ ...lensFilters(byId('steady'), {}), max_fall_3y: 10 })).toBeNull();
    expect(activeLens({ ...lensFilters(byId('steady'), {}), q: 'x' })).toBeNull();
  });

  it('recognises a lens whose sort is the default one even when the link leaves the sort out', () => {
    expect(activeLens({ sub_category: 'ELSS Tax Saver Fund' })).toBe('tax');
    expect(activeLens({ sub_category: 'ELSS Tax Saver Fund', plan: 'direct', sort: 'ret_3y', order: 'desc' })).toBe('tax');
  });

  it('is null for an ordinary screen', () => {
    expect(activeLens({ plan: 'direct', sort: 'ret_3y', order: 'desc' })).toBeNull();
  });

  it('is null when the sort differs, since the lens includes its sort', () => {
    expect(activeLens({ ...lensFilters(byId('quality'), {}), sort: 'name', order: 'asc' })).toBeNull();
  });
});
