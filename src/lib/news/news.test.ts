import { describe, expect, it } from 'vitest';
import { buildNewsPulsePrompt, cleanExcerpt, filterByTopic, pickHero, trendingTickers, TONE_VIEW } from './feed';
import { classifyTopic, NEWS_TOPICS, TOPIC_LABEL } from './topics';

describe('classifyTopic', () => {
  it.each([
    ['PNB penalised ₹1.24 lakh by RBI for non-compliance', 'regulatory'],
    ['SEBI bans 12 entities from the market', 'regulatory'],
    ['Q2 Results Today Live: Tata Power, Hindustan Copper to report', 'earnings'],
    ['Infosys net profit rises 8% YoY', 'earnings'],
    ['Punjab National Bank among 7 stocks showing White Marubozu pattern', 'technical'],
    ['Union Bank of India among 5 stocks closing above VWAP', 'technical'],
    ['Sensex soars 1,100 points; Nifty above 25,300', 'macro'],
    ['Crude oil prices ease as ceasefire holds', 'macro'],
    ['Rupee gains against the dollar', 'macro'],
  ])('%s -> %s', (title, topic) => {
    expect(classifyTopic({ title })).toBe(topic);
  });

  it('prefers regulatory over macro, and earnings over technical, when both match', () => {
    expect(classifyTopic({ title: 'RBI imposes penalty on bank' })).toBe('regulatory');
    expect(classifyTopic({ title: 'Q2 results: stock hits 52-week high' })).toBe('earnings');
  });

  it('leaves an unmatched headline untagged and does not match inside longer words', () => {
    expect(classifyTopic({ title: 'Kalyan Jewellers opens a new showroom' })).toBeNull();
    expect(classifyTopic({ title: 'Urban Company launches a banner campaign' })).toBeNull();
  });

  it('has a label for every topic', () => {
    for (const t of NEWS_TOPICS) expect(TOPIC_LABEL[t]).toBeTruthy();
  });
});

describe('cleanExcerpt', () => {
  it('strips tags and entities and collapses whitespace', () => {
    expect(cleanExcerpt('<p>Tata Power  &amp; Co&nbsp;report</p>', 'Different title')).toBe('Tata Power & Co report');
  });
  it('decodes double-encoded entities such as M&amp;amp;M', () => {
    expect(cleanExcerpt('Shares of M&amp;amp;M and L&amp;T rose', 'Other')).toBe('Shares of M&M and L&T rose');
  });
  it('returns null for empty text or a repeat of the title', () => {
    expect(cleanExcerpt(null, 't')).toBeNull();
    expect(cleanExcerpt('   ', 't')).toBeNull();
    expect(cleanExcerpt('Sensex jumps 1,000 points!', 'Sensex jumps 1,000 points')).toBeNull();
  });
  it('cuts long text at a word boundary with an ellipsis', () => {
    const out = cleanExcerpt('word '.repeat(80), 'x', 50)!;
    expect(out.length).toBeLessThanOrEqual(51);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe('pickHero', () => {
  it('is the newest story regardless of input order, and null for none', () => {
    const items = [{ published_at: '2026-11-10T08:00:00Z', id: 'a' }, { published_at: '2026-11-10T11:00:00Z', id: 'b' }, { published_at: '2026-11-10T09:00:00Z', id: 'c' }];
    expect(pickHero(items)?.id).toBe('b');
    expect(pickHero([])).toBeNull();
  });
});

describe('trendingTickers', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const item = (symbols: string[], published_at: string) => ({ symbols, published_at });

  it('ranks by mentions in the window, ties by recency', () => {
    const t = trendingTickers(
      [
        item(['PNB', 'TCS'], '2026-11-11T10:00:00Z'),
        item(['PNB'], '2026-11-11T09:00:00Z'),
        item(['TCS'], '2026-11-11T11:00:00Z'),
        item(['INFY'], '2026-11-11T08:00:00Z'),
      ],
      now
    );
    expect(t.map((x) => [x.symbol, x.count])).toEqual([['TCS', 2], ['PNB', 2], ['INFY', 1]]);
  });

  it('ignores stories older than the window and counts a ticker once per story', () => {
    const t = trendingTickers([item(['OLD'], '2026-11-09T10:00:00Z'), item(['PNB', 'pnb'], '2026-11-11T10:00:00Z')], now);
    expect(t).toEqual([{ symbol: 'PNB', count: 1, latest: '2026-11-11T10:00:00Z' }]);
  });

  it('respects the limit and returns nothing when no story is tagged', () => {
    expect(trendingTickers(Array.from({ length: 9 }, (_, i) => item([`S${i}`], '2026-11-11T10:00:00Z')), now, { limit: 3 })).toHaveLength(3);
    expect(trendingTickers([item([], '2026-11-11T10:00:00Z')], now)).toEqual([]);
  });
});

describe('filterByTopic', () => {
  const items = [{ title: 'Q2 results today' }, { title: 'Sensex jumps' }, { title: 'A quiet day' }];
  it('filters to a topic and keeps everything for null', () => {
    expect(filterByTopic(items, 'earnings').map((i) => i.title)).toEqual(['Q2 results today']);
    expect(filterByTopic(items, null)).toHaveLength(3);
  });
});

describe('tone and pulse prompt', () => {
  it('describes tone as a headline read, never a signal', () => {
    for (const t of Object.values(TONE_VIEW)) expect(t.title).toMatch(/not a signal/i);
    expect(TONE_VIEW.positive.label).toBe('Positive');
  });
  it('lists only the supplied headlines, capped', () => {
    const p = buildNewsPulsePrompt([{ title: 'A', source: 'X', sentiment: 'positive' }, { title: 'B', source: 'Y', sentiment: 'negative' }], 1);
    expect(p).toContain('- A (X, positive tone)');
    expect(p).not.toContain('B');
    expect(buildNewsPulsePrompt([])).toBe('No headlines are available.');
  });
});
