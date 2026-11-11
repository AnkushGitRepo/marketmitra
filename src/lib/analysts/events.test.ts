import { describe, expect, it } from 'vitest';
import type { Bar } from '@/lib/chart/bars';
import { detectEvents, type EventInputs } from './events';
import { EMPTY_WATCH } from './types';

const bar = (i: number, close: number, volume = 1000): Bar => ({ time: `2026-10-${String(i + 1).padStart(2, '0')}`, open: close, high: close, low: close, close, volume });
const flat = (n: number, close = 100, volume = 1000) => Array.from({ length: n }, (_, i) => bar(i, close, volume));

const base: EventInputs = {
  symbol: 'ACC',
  bars: flat(25),
  range52: { low: 50, high: 200 },
  news: [],
  documents: [],
  results: null,
  watch: EMPTY_WATCH,
};

describe('price and volume', () => {
  it('flags a big one-day move, with the direction and the new price', () => {
    const bars = [...flat(24), bar(24, 105)];
    const { events } = detectEvents({ ...base, bars });
    const e = events.find((x) => x.kind === 'price');
    expect(e?.title).toMatch(/\+5\.0%/);
    expect(e?.title).toContain('₹105');
    expect(e?.alert).toBe('medium');
  });
  it('treats a move of 8% or more as a high alert and ignores a small one', () => {
    expect(detectEvents({ ...base, bars: [...flat(24), bar(24, 91)] }).events.find((x) => x.kind === 'price')?.alert).toBe('high');
    expect(detectEvents({ ...base, bars: [...flat(24), bar(24, 101)] }).events.find((x) => x.kind === 'price')).toBeUndefined();
  });
  it('flags a volume spike above 2x the 20-day average', () => {
    const bars = [...flat(24, 100, 1000), bar(24, 100, 2600)];
    expect(detectEvents({ ...base, bars }).events.find((x) => x.kind === 'volume')?.title).toMatch(/2\.6x/);
    expect(detectEvents({ ...base, bars: [...flat(24), bar(24, 100, 1500)] }).events.find((x) => x.kind === 'volume')).toBeUndefined();
  });
  it('needs enough history for the volume baseline and does not divide by zero', () => {
    expect(detectEvents({ ...base, bars: flat(5) }).events).toEqual([]);
    expect(detectEvents({ ...base, bars: [...flat(24, 100, 0), bar(24, 100, 500)] }).events.find((x) => x.kind === 'volume')).toBeUndefined();
  });
});

describe('52-week range', () => {
  it('reports touching the high once, not every day', () => {
    const bars = [...flat(24), bar(24, 199)];
    const first = detectEvents({ ...base, bars });
    expect(first.events.find((x) => x.kind === 'range')?.title).toMatch(/52-week high/i);
    expect(first.nextWatch.atRangeHigh).toBe(true);
    const second = detectEvents({ ...base, bars, watch: first.nextWatch });
    expect(second.events.find((x) => x.kind === 'range')).toBeUndefined();
  });
  it('clears the flag when the price leaves the zone, so a later return is reported again', () => {
    const away = detectEvents({ ...base, bars: flat(25, 120), watch: { ...EMPTY_WATCH, atRangeHigh: true } });
    expect(away.nextWatch.atRangeHigh).toBe(false);
  });
  it('reports the low too', () => {
    expect(detectEvents({ ...base, bars: [...flat(24), bar(24, 50.4)] }).events.find((x) => x.kind === 'range')?.title).toMatch(/52-week low/i);
  });
});

describe('news, filings and results', () => {
  const item = (url: string, title: string, sentiment: 'positive' | 'neutral' | 'negative' = 'neutral') => ({ url, title, published_at: '2026-11-10', sentiment });
  it('reports only news not seen before, and remembers it', () => {
    const news = [item('u1', 'ACC raises prices'), item('u2', 'Cement demand firms up'), item('u3', 'Old story')];
    const out = detectEvents({ ...base, news, watch: { ...EMPTY_WATCH, seenNewsUrls: ['u3'] } });
    const e = out.events.find((x) => x.kind === 'news');
    expect(e?.facts).toHaveLength(2);
    expect(out.nextWatch.seenNewsUrls).toEqual(expect.arrayContaining(['u1', 'u2', 'u3']));
    expect(detectEvents({ ...base, news, watch: out.nextWatch }).events.find((x) => x.kind === 'news')).toBeUndefined();
  });
  it('is quiet for a single neutral headline, but not for a negative one', () => {
    expect(detectEvents({ ...base, news: [item('u1', 'Routine mention')] }).events.find((x) => x.kind === 'news')).toBeUndefined();
    expect(detectEvents({ ...base, news: [item('u1', 'Regulator fines ACC', 'negative')] }).events.find((x) => x.kind === 'news')?.alert).toBe('medium');
  });
  it('caps the remembered urls so the record cannot grow without bound', () => {
    const many = Array.from({ length: 300 }, (_, i) => item(`u${i}`, `Story ${i}`));
    expect(detectEvents({ ...base, news: many }).nextWatch.seenNewsUrls.length).toBeLessThanOrEqual(200);
  });
  it('reports a new filing', () => {
    const out = detectEvents({ ...base, documents: [{ title: 'Annual Report 2026', url: 'd1' }, { title: 'Annual Report 2025', url: 'd0' }], watch: { ...EMPTY_WATCH, seenDocUrls: ['d0'] } });
    expect(out.events.find((x) => x.kind === 'filing')?.title).toContain('Annual Report 2026');
  });
  it('treats the very first look at filings as a baseline, not as news', () => {
    const out = detectEvents({ ...base, documents: [{ title: 'Annual Report 2025', url: 'd0' }] });
    expect(out.events.find((x) => x.kind === 'filing')).toBeUndefined();
    expect(out.nextWatch.seenDocUrls).toEqual(['d0']);
  });
  it('reports a results change only after a baseline exists', () => {
    const results = { netProfitQtr: 120, qtrProfitVarPct: -12.5, qtrSalesVarPct: 3 };
    expect(detectEvents({ ...base, results }).events.find((x) => x.kind === 'earnings')).toBeUndefined();
    const changed = detectEvents({ ...base, results, watch: { ...EMPTY_WATCH, resultsKey: 'old' } });
    const e = changed.events.find((x) => x.kind === 'earnings');
    expect(e?.title).toMatch(/results/i);
    expect(e?.facts.join(' ')).toContain('-12.5%');
    expect(e?.alert).toBe('medium');
  });
  it('does not mutate its input', () => {
    const before = JSON.stringify(base);
    detectEvents(base);
    expect(JSON.stringify(base)).toBe(before);
  });
});
