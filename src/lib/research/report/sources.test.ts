import { describe, expect, it } from 'vitest';
import { topSources } from './sources';

const s = (title: string, url = `https://${title}/x`) => ({ title, url });

describe('topSources', () => {
  it('lists each domain once', () => {
    expect(topSources([s('trai.gov.in'), s('trai.gov.in', 'https://www.trai.gov.in/other')]).map((x) => x.title)).toEqual(['trai.gov.in']);
  });
  it('puts regulators and exchanges first and video and social sites last', () => {
    const got = topSources([s('youtube.com'), s('koalagains.com'), s('trai.gov.in'), s('nseindia.com'), s('businessworld.in')]).map((x) => x.title);
    expect(got).toEqual(['trai.gov.in', 'nseindia.com', 'koalagains.com', 'businessworld.in', 'youtube.com']);
  });
  it('keeps at most five', () => {
    const many = Array.from({ length: 20 }, (_, i) => s(`site${i}.com`));
    expect(topSources(many)).toHaveLength(5);
  });
  it('reads the domain from the title when a search tool gave only a redirect link', () => {
    const redirect = { title: 'trai.gov.in', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc' };
    const other = { title: 'ibef.org', url: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/def' };
    expect(topSources([other, redirect]).map((x) => x.title)).toEqual(['trai.gov.in', 'ibef.org']);
  });
  it('returns nothing for nothing', () => {
    expect(topSources([])).toEqual([]);
  });
});
