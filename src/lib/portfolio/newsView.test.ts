import { describe, expect, it } from 'vitest';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import { classifyImpact, filterNews, holdingWeights, linkNews, newsFilterCounts, sentimentLabel } from './newsView';

const story = (over: Partial<NewsItem>): NewsItem => ({
  url: 'u', title: 't', summary: null, source: 's', published_at: '2026-11-01T00:00:00Z', sentiment: 'neutral', sentiment_score: 0, symbols: [], ...over,
});

describe('classifyImpact', () => {
  it('is routine for neutral tone whatever the weight', () => expect(classifyImpact('neutral', 0.9, 40)).toBe('routine'));
  it('is high for a strong tone on a big position', () => expect(classifyImpact('negative', -0.6, 22)).toBe('high'));
  it('is material for a strong tone on a small position', () => expect(classifyImpact('positive', 0.7, 3)).toBe('material'));
  it('is routine for a faint tone', () => expect(classifyImpact('positive', 0.1, 30)).toBe('routine'));
});

describe('linkNews', () => {
  const weights = [{ symbol: 'TCS', weightPct: 5 }, { symbol: 'LAURUSLABS', weightPct: 22.8 }];
  it('drops stories about stocks you do not hold and orders holdings by weight', () => {
    const rows = linkNews([story({ symbols: ['tcs', 'LAURUSLABS', 'LAURUSLABS'] }), story({ url: 'x', symbols: ['INFY'] })], weights);
    expect(rows).toHaveLength(1);
    expect(rows[0].holdings.map((h) => h.symbol)).toEqual(['LAURUSLABS', 'TCS']);
  });
});

describe('filters', () => {
  const rows = linkNews(
    [
      story({ url: 'a', symbols: ['LAURUSLABS'], sentiment: 'negative', sentiment_score: -0.8 }),
      story({ url: 'b', symbols: ['TCS'], sentiment: 'positive', sentiment_score: 0.4 }),
    ],
    [{ symbol: 'TCS', weightPct: 5 }, { symbol: 'LAURUSLABS', weightPct: 22.8 }]
  );
  it('filters by tone, impact and ticker', () => {
    expect(filterNews(rows, 'high', null).map((r) => r.item.url)).toEqual(['a']);
    expect(filterNews(rows, 'bullish', null).map((r) => r.item.url)).toEqual(['b']);
    expect(filterNews(rows, 'all', 'TCS').map((r) => r.item.url)).toEqual(['b']);
  });
  it('counts', () => expect(newsFilterCounts(rows)).toEqual({ all: 2, high: 1, bullish: 1, bearish: 1 }));
  it('labels', () => expect(sentimentLabel('positive', 'high')).toBe('Bullish · High impact'));
});

describe('holdingWeights', () => {
  it('weights priced holdings and skips unpriced ones', () => {
    const w = holdingWeights([{ symbol: 'a', quantity: 1, ltp: 30 }, { symbol: 'b', quantity: 1, ltp: 70 }, { symbol: 'c', quantity: 5, ltp: null }]);
    expect(w).toEqual([{ symbol: 'A', weightPct: 30 }, { symbol: 'B', weightPct: 70 }]);
  });
  it('returns nothing when no holding is priced', () => expect(holdingWeights([{ symbol: 'a', quantity: 1, ltp: null }])).toEqual([]));
});
