import { describe, expect, it } from 'vitest';
import { CLEARED_FILTERS, DEFAULT_FILTERS, DEFAULT_SORT, effectiveFilters, isSearching, resolveFilters } from './defaultView';

describe('the opening view', () => {
  it('is diversified funds, Direct plan, best Sharpe first', () => {
    expect(DEFAULT_FILTERS).toEqual({ plan: 'direct', sort: 'sharpe_3y', order: 'desc', exclude_thematic: true });
    expect(DEFAULT_SORT).toEqual({ key: 'sharpe_3y', dir: 'desc' });
  });

  it('is what "Clear all" returns to', () => {
    expect(CLEARED_FILTERS).toEqual(DEFAULT_FILTERS);
  });
});

describe('effectiveFilters: what is actually asked of the data service', () => {
  it('leaves the diversified view alone for an ordinary screen', () => {
    expect(effectiveFilters(DEFAULT_FILTERS)).toEqual(DEFAULT_FILTERS);
  });

  it('never hides a sector fund from someone who searched for it by name', () => {
    expect(effectiveFilters({ ...DEFAULT_FILTERS, q: 'healthcare' }).exclude_thematic).toBeUndefined();
  });

  it('never hides the sub-category someone chose', () => {
    expect(effectiveFilters({ ...DEFAULT_FILTERS, sub_category: 'Sectoral Fund' }).exclude_thematic).toBeUndefined();
  });

  it('does not change what it is given, so the reader\'s choice survives the search being cleared', () => {
    const input = { ...DEFAULT_FILTERS, q: 'x' };
    effectiveFilters(input);
    expect(input.exclude_thematic).toBe(true);
  });
});

describe('isSearching', () => {
  it('is true for a name or a chosen sub-category, ignoring blanks', () => {
    expect(isSearching({ q: 'axis' })).toBe(true);
    expect(isSearching({ sub_category: 'Large Cap Fund' })).toBe(true);
    expect(isSearching({ q: '   ' })).toBe(false);
    expect(isSearching({})).toBe(false);
  });
});

describe('resolveFilters', () => {
  it('gives the opening view for a bare link', () => {
    expect(resolveFilters({})).toEqual(DEFAULT_FILTERS);
  });

  it('keeps the opening view underneath whatever the link sets', () => {
    expect(resolveFilters({ min_ret_3y: 15 })).toEqual({ ...DEFAULT_FILTERS, min_ret_3y: 15 });
    expect(resolveFilters({ sort: 'ret_3y', order: 'asc' })).toMatchObject({ sort: 'ret_3y', order: 'asc', exclude_thematic: true });
  });

  it('shows everything when the link says so', () => {
    expect(resolveFilters({ exclude_thematic: false })).toMatchObject({ exclude_thematic: false });
  });

  it('keeps the opening view underneath a search, so clearing the search goes back to it', () => {
    expect(resolveFilters({ q: 'healthcare' })).toMatchObject({ q: 'healthcare', exclude_thematic: true });
    expect(resolveFilters({ sub_category: 'Sectoral Fund' })).toMatchObject({ exclude_thematic: true });
  });

  it('does not change what it is given', () => {
    const input = { q: 'x' };
    resolveFilters(input);
    expect(input).toEqual({ q: 'x' });
  });
});
