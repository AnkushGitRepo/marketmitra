import { describe, expect, it } from 'vitest';
import { formatChatContext, formatPageContext, mergeNews } from './chatContext';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { NewsItem } from '@/lib/dashboard/newsApi';

const holding = (over: Partial<EnrichedHolding> = {}): EnrichedHolding => ({
  id: 'h1',
  userId: 'u1',
  symbol: 'RELIANCE',
  quantity: 10,
  avgPrice: 2000,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  name: 'Reliance Industries',
  sector: 'Energy',
  ltp: 2500,
  dayChange: 10,
  dayChangePct: 0.4,
  ...over,
});

const news = (over: Partial<NewsItem> = {}): NewsItem => ({
  url: 'https://example.com/a',
  title: 'Something happened',
  summary: null,
  source: 'ET',
  published_at: '2026-09-01T10:00:00Z',
  sentiment: 'neutral',
  sentiment_score: 0,
  symbols: [],
  ...over,
});

describe('formatChatContext', () => {
  it('reports an empty portfolio plainly', () => {
    const out = formatChatContext([], []);
    expect(out).toContain('no holdings added yet');
  });

  it('summarises holdings with value, invested and per-line P&L', () => {
    const out = formatChatContext([holding()], []);
    expect(out).toContain('1 holding(s)');
    expect(out).toContain('invested ₹20,000');
    expect(out).toContain('current value ₹25,000');
    expect(out).toContain('Reliance Industries (RELIANCE), Energy');
    expect(out).toContain('unrealised P&L +₹5,000');
  });

  it('marks holdings with no live price instead of inventing one', () => {
    const out = formatChatContext([holding({ ltp: null })], []);
    expect(out).toContain('no live price');
    expect(out).not.toContain('unrealised P&L');
  });

  it('lists news with its sentiment label and date', () => {
    const out = formatChatContext([], [news({ title: 'Rate cut', sentiment: 'positive' })]);
    expect(out).toContain('[positive] Rate cut — ET, 2026-09-01');
  });
});

describe('mergeNews', () => {
  it('de-dupes by url, sorts newest-first and caps at 10', () => {
    const older = news({ url: 'u-old', published_at: '2026-01-01T00:00:00Z' });
    const newer = news({ url: 'u-new', published_at: '2026-09-01T00:00:00Z' });
    const dup = news({ url: 'u-new', published_at: '2026-09-01T00:00:00Z', title: 'dup' });
    const extras = Array.from({ length: 15 }, (_, i) =>
      news({ url: `x${i}`, published_at: `2026-05-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z` })
    );

    const merged = mergeNews([older, newer, dup], extras);
    expect(merged).toHaveLength(10);
    expect(merged[0].url).toBe('u-new');
    expect(merged.filter((n) => n.url === 'u-new')).toHaveLength(1);
  });
});

describe('formatPageContext', () => {
  it('reports unknown when no context is given', () => {
    expect(formatPageContext(null)).toBe('The user is somewhere in the app; exact page unknown.');
  });

  it('names the page for non-stock pages', () => {
    expect(formatPageContext({ page: 'portfolio' })).toBe('The user is currently on the portfolio page.');
  });

  it('includes ticker and range for a stock page', () => {
    expect(formatPageContext({ page: 'stock', ticker: 'TCS', range: '1y' })).toBe(
      'The user is currently on a stock detail page for TCS, viewing the 1y price chart.'
    );
  });

  it('handles a stock page with no ticker gracefully', () => {
    expect(formatPageContext({ page: 'stock' })).toBe('The user is currently on a stock detail page.');
  });

  it('includes name and range for an index page', () => {
    expect(formatPageContext({ page: 'index', name: 'NIFTY 50', range: '1y' })).toBe(
      'The user is currently on an index detail page for NIFTY 50, viewing the 1y price chart.'
    );
  });
});
