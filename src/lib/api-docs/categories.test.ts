import { describe, expect, it } from 'vitest';
import { CATEGORY_ORDER, categoryOf, groupEndpoints, type DocEndpoint } from './categories';

describe('categoryOf', () => {
  it('maps spec tags onto the five reader-facing categories', () => {
    expect(categoryOf('/api/quotes', 'Market data')).toBe('Market Data');
    expect(categoryOf('/api/watchlists', 'Watchlists')).toBe('Watchlists & Screener');
    expect(categoryOf('/api/holdings', 'Portfolio')).toBe('Portfolio & Notes');
    expect(categoryOf('/api/mitra/chat', 'AI')).toBe('AI & Mitra Copilot');
    expect(categoryOf('/api/advisor/plan', 'Advisor')).toBe('AI & Mitra Copilot');
    expect(categoryOf('/api/cron/evaluate-alerts', 'Cron')).toBe('System & Cron');
    expect(categoryOf('/api/settings/ai', 'Settings')).toBe('System & Cron');
  });

  it('lets the path override the tag for screener and notes', () => {
    expect(categoryOf('/api/screener', 'Market data')).toBe('Watchlists & Screener');
    expect(categoryOf('/api/screener/facets', 'Market data')).toBe('Watchlists & Screener');
    expect(categoryOf('/api/notes/{id}', 'Portfolio')).toBe('Portfolio & Notes');
  });

  it('falls back to System & Cron for unknown tags', () => {
    expect(categoryOf('/api/x', undefined)).toBe('System & Cron');
    expect(categoryOf('/api/x', 'Mystery')).toBe('System & Cron');
  });
});

describe('groupEndpoints', () => {
  const ep = (path: string, tag: string): DocEndpoint => ({ path, tag });

  it('returns every category in fixed order, keeping empty ones out', () => {
    const groups = groupEndpoints([ep('/api/cron/a', 'Cron'), ep('/api/quotes', 'Market data')]);
    expect(groups.map((g) => g.category)).toEqual(['Market Data', 'System & Cron']);
    expect(CATEGORY_ORDER).toHaveLength(5);
  });

  it('does not mutate its input', () => {
    const input = [ep('/api/quotes', 'Market data')];
    const copy = [...input];
    groupEndpoints(input);
    expect(input).toEqual(copy);
  });
});
