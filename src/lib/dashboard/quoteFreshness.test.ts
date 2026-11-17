import { describe, expect, it } from 'vitest';
import { isFreshQuote, quoteTime } from './quoteFreshness';

const NOW = new Date('2026-11-17T09:00:00Z');
const at = (iso: string) => ({ regularMarketTime: new Date(iso) });

describe('isFreshQuote', () => {
  it('accepts a quote from today or the last few days (weekends, a holiday)', () => {
    expect(isFreshQuote(at('2026-11-17T08:47:31Z'), NOW)).toBe(true);
    expect(isFreshQuote(at('2026-11-13T10:00:00Z'), NOW)).toBe(true);
  });

  it('rejects a dead listing: Yahoo still serves SME tickers last traded in July 2024', () => {
    expect(isFreshQuote(at('2024-07-23T20:00:00Z'), NOW)).toBe(false);
  });

  it('draws the line at the configured age', () => {
    expect(isFreshQuote(at('2026-11-10T09:00:00Z'), NOW, 7)).toBe(true);
    expect(isFreshQuote(at('2026-11-10T08:59:00Z'), NOW, 7)).toBe(false);
  });

  it('cannot judge a quote with no time, so it does not throw it away', () => {
    expect(isFreshQuote({ regularMarketPrice: 10 }, NOW)).toBe(true);
  });
});

describe('quoteTime', () => {
  it('reads a Date, epoch seconds or milliseconds, and an ISO string', () => {
    const iso = '2026-11-17T08:47:31.000Z';
    expect(quoteTime({ regularMarketTime: new Date(iso) })?.toISOString()).toBe(iso);
    expect(quoteTime({ regularMarketTime: Date.parse(iso) / 1000 })?.toISOString()).toBe(iso);
    expect(quoteTime({ regularMarketTime: Date.parse(iso) })?.toISOString()).toBe(iso);
    expect(quoteTime({ regularMarketTime: iso })?.toISOString()).toBe(iso);
  });

  it('is null for anything else', () => {
    expect(quoteTime({})).toBeNull();
    expect(quoteTime({ regularMarketTime: 'soon' })).toBeNull();
  });
});
