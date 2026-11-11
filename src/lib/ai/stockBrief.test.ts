import { describe, expect, it } from 'vitest';
import { buildBriefPrompt, chipPrompt, parseBrief, sanitizeBrief, type BriefFacts } from './stockBrief';
import type { StockInsightInput } from './insightPrompts';

describe('parseBrief', () => {
  it('parses plain JSON', () => {
    expect(parseBrief('{"strengths":["a","b"],"watchpoints":["c"]}')).toEqual({ strengths: ['a', 'b'], watchpoints: ['c'] });
  });
  it('tolerates code fences and a trailing disclaimer line', () => {
    const text = '```json\n{"strengths":["a"],"watchpoints":["c"]}\n```\nThis is a synthesis of public data, not investment advice.';
    expect(parseBrief(text)).toEqual({ strengths: ['a'], watchpoints: ['c'] });
  });
  it('caps at 2 strengths and 1 watchpoint, trims, and drops blanks', () => {
    const b = parseBrief('{"strengths":[" a ","","b","c"],"watchpoints":["x","y"]}');
    expect(b).toEqual({ strengths: ['a', 'b'], watchpoints: ['x'] });
  });
  it('keeps a valid valuation and entry view and drops an invalid valuation', () => {
    expect(parseBrief('{"strengths":["a"],"watchpoints":[],"valuation":"undervalued","entry":"Looks reasonable."}')).toMatchObject({ valuation: 'undervalued', entry: 'Looks reasonable.' });
    expect(parseBrief('{"strengths":["a"],"watchpoints":[],"valuation":"moon"}')?.valuation).toBeUndefined();
  });
  it('returns null for non-JSON, empty content or the wrong shape', () => {
    expect(parseBrief('I cannot do that')).toBeNull();
    expect(parseBrief('{"strengths":[],"watchpoints":[]}')).toBeNull();
    expect(parseBrief('{"strengths":"nope"}')).toBeNull();
  });
});

describe('sanitizeBrief', () => {
  const full = { strengths: ['a'], watchpoints: ['b'], valuation: 'overvalued' as const, entry: 'Wait.' };
  it('removes any verdict fields in guarded mode, even if the model produced them', () => {
    expect(sanitizeBrief(full, 'guarded')).toEqual({ strengths: ['a'], watchpoints: ['b'] });
  });
  it('keeps them in unrestricted mode', () => {
    expect(sanitizeBrief(full, 'unrestricted')).toEqual(full);
  });
  it('does not mutate its input', () => {
    sanitizeBrief(full, 'guarded');
    expect(full.valuation).toBe('overvalued');
  });
});

describe('buildBriefPrompt', () => {
  const input: StockInsightInput = {
    symbol: 'SBIN',
    company: { name: 'State Bank of India', sector: 'Financial Services', industry: 'Banks', about: null },
    ratios: [{ name: 'Stock P/E', value: '11.5', unit: null }],
    latestClose: 1070,
    financialsSummary: [],
    shareholdingLatest: [],
    news: [],
  };
  const facts: BriefFacts = { pe: 11.53, pb: 1.47, peerMedianPe: 6.9, rangePct: 44, range: { low: 933.9, high: 1234.7 } };
  it('states the computed valuation facts so the model never has to invent them', () => {
    const p = buildBriefPrompt(input, facts);
    expect(p).toContain('P/E 11.5x');
    expect(p).toContain('peer median P/E 6.9x');
    expect(p).toContain('44% of the way up');
    expect(p).toContain('SBIN');
  });
  it('says so when facts are missing instead of guessing', () => {
    const p = buildBriefPrompt(input, { pe: null, pb: null, peerMedianPe: null, rangePct: null, range: null });
    expect(p).toContain('not available');
  });
});

describe('chipPrompt', () => {
  it('asks for a neutral summary when guarded and for a view when unrestricted', () => {
    expect(chipPrompt('SBIN', 'guarded')).toBe("Summarise SBIN's valuation ratios against its peers and its own price range.");
    expect(chipPrompt('SBIN', 'unrestricted')).toBe('Is SBIN undervalued at its current price? Show the numbers behind your view.');
  });
});
