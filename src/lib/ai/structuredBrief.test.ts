import { describe, expect, it } from 'vitest';
import { DASHBOARD_SPEC, IPO_SPEC, MARKET_SPEC, NEWS_SPEC } from './briefSpecs';
import { parseStructured, readStoredBrief, sanitizeTickers, serializeBrief, splitTickers, toneLabel } from './structuredBrief';

const item = (key: string, tone: string, text = 'Net +₹1,200 (+0.8%).') => ({ key, tone, text });
const json = (items: unknown[]) => JSON.stringify({ items });

describe('parseStructured', () => {
  it('parses the spec items and keeps the spec order whatever order the model used', () => {
    const b = parseStructured(json([item('risk', 'warning'), item('return', 'positive'), item('exposure', 'neutral')]), DASHBOARD_SPEC);
    expect(b?.items.map((i) => i.key)).toEqual(['return', 'exposure', 'risk']);
    expect(b?.items[0]).toEqual({ key: 'return', tone: 'positive', text: 'Net +₹1,200 (+0.8%).' });
  });
  it('maps tone words from any surface (bullish / negative / developing) onto three tones', () => {
    const b = parseStructured(json([item('earnings', 'POSITIVE'), item('macro', '[NEGATIVE]'), item('sector', 'Developing')]), NEWS_SPEC);
    expect(b?.items.map((i) => i.tone)).toEqual(['positive', 'warning', 'neutral']);
  });
  it('treats a missing or unknown tone as neutral rather than dropping the item', () => {
    const b = parseStructured(JSON.stringify({ items: [{ key: 'breadth', text: 'Broad rally.' }, item('leaders', 'sparkly')] }), MARKET_SPEC);
    expect(b?.items.map((i) => i.tone)).toEqual(['neutral', 'neutral']);
  });
  it('maps descriptive titles onto the keys', () => {
    const b = parseStructured(json([item('Listing Potential (GMP)', 'positive'), item('Offer Structure', 'neutral'), item('Business Moat', 'neutral'), item('Key Red Flag', 'warning')]), IPO_SPEC);
    expect(b?.items.map((i) => i.key)).toEqual(['listing', 'offer', 'business', 'risk']);
  });
  it('tolerates fences, trailing text and a different top-level property', () => {
    const text = '```json\n' + JSON.stringify({ points: [item('return', 'positive')] }) + '\n```\nThis is a synthesis of public data, not investment advice.';
    expect(parseStructured(text, DASHBOARD_SPEC)?.items).toHaveLength(1);
  });
  it('accepts items keyed by name', () => {
    const b = parseStructured(JSON.stringify({ items: { return: { tone: 'positive', text: 'a' }, risk: 'No alert near its trigger.' } }), DASHBOARD_SPEC);
    expect(b?.items.map((i) => i.key)).toEqual(['return', 'risk']);
  });
  it('salvages complete items from a reply cut off by the token limit', () => {
    const cut = '{"items":[{"key":"breadth","tone":"positive","text":"Broad rally, 40 up vs 10 down."},{"key":"leaders","tone":"neutral","text":"IT +1.2% leads; Metal -0.';
    expect(parseStructured(cut, MARKET_SPEC)?.items.map((i) => i.key)).toEqual(['breadth']);
  });
  it('drops unknown keys, empty text and duplicates (first wins), and trims long text', () => {
    const b = parseStructured(json([item('return', 'positive', 'first'), item('return', 'warning', 'second'), item('nonsense', 'positive'), item('risk', 'warning', '   '), item('exposure', 'neutral', 'x'.repeat(600))]), DASHBOARD_SPEC);
    expect(b?.items.map((i) => [i.key, i.text.length])).toEqual([['return', 5], ['exposure', 320]]);
  });
  it('returns null when nothing usable can be recovered', () => {
    expect(parseStructured('sorry', DASHBOARD_SPEC)).toBeNull();
    expect(parseStructured(json([]), DASHBOARD_SPEC)).toBeNull();
    expect(parseStructured('{"items":[{"key":"retu', DASHBOARD_SPEC)).toBeNull();
  });
});

describe('tickers', () => {
  it('splits [TICKER] tags into text and ticker segments', () => {
    expect(splitTickers('Bank stocks [PNB] and [BANKBARODA] rallied; [ok] stays.')).toEqual([
      { type: 'text', value: 'Bank stocks ' },
      { type: 'ticker', value: 'PNB' },
      { type: 'text', value: ' and ' },
      { type: 'ticker', value: 'BANKBARODA' },
      { type: 'text', value: ' rallied; [ok] stays.' },
    ]);
    expect(splitTickers('no tags')).toEqual([{ type: 'text', value: 'no tags' }]);
  });
  it('keeps only tags the data actually contains and unwraps the rest, so no link points at an invented ticker', () => {
    expect(sanitizeTickers('[PNB] up, [FAKECO] down, [pnb] again', new Set(['PNB']))).toBe('[PNB] up, FAKECO down, [PNB] again');
  });
});

describe('storage and labels', () => {
  it('round-trips through the stored JSON and ignores old prose briefs', () => {
    const brief = { items: [{ key: 'return', tone: 'positive' as const, text: 'Net +₹1,200.' }] };
    expect(readStoredBrief(serializeBrief(brief), DASHBOARD_SPEC)).toEqual(brief);
    expect(readStoredBrief('The portfolio is top-heavy and skewed to Financial Services.', DASHBOARD_SPEC)).toBeNull();
    expect(readStoredBrief(null, DASHBOARD_SPEC)).toBeNull();
  });
  it('labels tones per surface: the news pulse says Developing, the rest say Neutral', () => {
    expect(toneLabel('neutral', NEWS_SPEC)).toBe('Developing');
    expect(toneLabel('neutral', DASHBOARD_SPEC)).toBe('Neutral');
    expect(toneLabel('warning', NEWS_SPEC)).toBe('Negative');
    expect(toneLabel('warning', DASHBOARD_SPEC)).toBe('Watch');
  });
  it('has distinct keys within each spec', () => {
    for (const s of [DASHBOARD_SPEC, MARKET_SPEC, NEWS_SPEC, IPO_SPEC]) expect(new Set(s.items.map((i) => i.key)).size).toBe(s.items.length);
  });
});
