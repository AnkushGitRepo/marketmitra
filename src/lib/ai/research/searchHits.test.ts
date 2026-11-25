import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeEntities, dedupeHits, hostOf, isDuckDuckGoHost, parseDuckDuckGo, parseGoogleNews, replaceUntilStable, type SearchHit } from './searchHits';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');

describe('parseDuckDuckGo (a recorded real page)', () => {
  const hits = parseDuckDuckGo(fixture('duckduckgo.html'));
  it('reads the direct publisher link, not the redirect', () => {
    expect(hits).toHaveLength(3);
    expect(hits[0].url).toBe('https://www.moneycontrol.com/news/business/agr-case-explained-sc-s-final-call-and-what-it-means-for-vodafone-idea-airtel-12942367.html');
    expect(hits[0].source).toBe('moneycontrol.com');
  });
  it('decodes entities in titles and strips markup from snippets', () => {
    expect(hits[0].title).toBe("AGR case explained: SC's final call and what it means for Vodafone Idea ...");
    expect(hits[0].snippet).toContain('The Supreme Court (SC) has dismissed the review petitions');
    expect(hits[0].snippet).not.toContain('<b>');
  });
  it('marks every direct link as readable', () => {
    expect(hits.every((h) => h.readable)).toBe(true);
  });
  it('is empty for a page with no results', () => {
    expect(parseDuckDuckGo('<html><body>No results.</body></html>')).toEqual([]);
  });
});

describe('parseGoogleNews (a recorded real feed)', () => {
  const hits = parseGoogleNews(fixture('googlenews.xml'));
  it('reads the headline, outlet and date, and says the link cannot be opened', () => {
    expect(hits).toHaveLength(3);
    expect(hits[0].title).toBe('Vodafone Idea share price: Citi cites key monitorable for ₹16 target - CNBC TV18');
    expect(hits[0].source).toBe('LinkedIn');
    expect(hits[0].date).toBe('2026-11-16');
    expect(hits[0].readable).toBe(false);
  });
  it('is empty for a feed with no items', () => {
    expect(parseGoogleNews('<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('helpers', () => {
  const hit = (url: string, title = 't'): SearchHit => ({ title, url, snippet: '', source: hostOf(url), date: null, readable: true });
  it('decodes common entities', () => {
    expect(decodeEntities('a &amp; b &#x27;c&#x27; &quot;d&quot; &#8377;')).toBe('a & b \'c\' "d" ₹');
  });
  it('dedupes by address, ignoring www, trailing slash, fragments and tracking parameters', () => {
    const merged = dedupeHits([[hit('https://www.a.com/x/?utm_source=z#top', 'first'), hit('https://b.com/y')], [hit('https://a.com/x', 'second'), hit('https://c.com/z')]], 10);
    expect(merged.map((h) => h.url)).toEqual(['https://www.a.com/x/?utm_source=z#top', 'https://b.com/y', 'https://c.com/z']);
    expect(merged[0].title).toBe('first');
  });
  it('interleaves lists and honours the limit', () => {
    const merged = dedupeHits([[hit('https://a.com/1'), hit('https://a.com/2')], [hit('https://b.com/1'), hit('https://b.com/2')]], 3);
    expect(merged.map((h) => h.url)).toEqual(['https://a.com/1', 'https://b.com/1', 'https://a.com/2']);
  });
  it('names the host without www', () => {
    expect(hostOf('https://www.sebi.gov.in/x')).toBe('sebi.gov.in');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('isDuckDuckGoHost', () => {
  it('accepts the site and its subdomains, not a look-alike', () => {
    expect(isDuckDuckGoHost('duckduckgo.com')).toBe(true);
    expect(isDuckDuckGoHost('html.DuckDuckGo.com')).toBe(true);
    expect(isDuckDuckGoHost('evilduckduckgo.com')).toBe(false);
    expect(isDuckDuckGoHost('duckduckgo.com.evil.io')).toBe(false);
  });
});

describe('replaceUntilStable', () => {
  it('removes nested constructs a single pass would rebuild', () => {
    // One pass over this leaves a new, complete comment behind; the second removes it.
    expect(replaceUntilStable('<!<!-- -->--  c -->x', /<!--[\s\S]*?-->/g, '')).toBe('x');
    expect('<!<!-- -->--  c -->x'.replace(/<!--[\s\S]*?-->/g, '')).toBe('<!--  c -->x');
  });
  it('stops on text that no longer changes', () => {
    expect(replaceUntilStable('plain', /<[^>]*>/g, '')).toBe('plain');
  });
});

describe('parsing hostile markup', () => {
  it('leaves no tag characters in a snippet', () => {
    const html = '<div class="result results_links"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.com%2Fx">Title</a><a class="result__snippet">Hi <scr<b>ipt>alert(1)</scr</b>ipt></a></div>';
    const [hit] = parseDuckDuckGo(html);
    expect(hit.snippet).not.toMatch(/[<>]/);
  });
});
