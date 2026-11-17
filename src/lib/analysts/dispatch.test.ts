import { describe, expect, it } from 'vitest';
import { buildDispatch, portfolioWeights, renderDispatchText, upgradeDispatch, type DispatchAnalyst } from './dispatch';
import type { JournalEntry } from './types';

const NOW = new Date('2026-11-12T03:00:00Z');
const entry = (symbol: string, over: Partial<JournalEntry> = {}): JournalEntry => ({ id: `${symbol}${over.title ?? ''}`, symbol, ts: '2026-11-11T14:00:00Z', kind: 'news', title: 'Headline', body: null, impact: null, alert: 'low', ...over });
const analyst = (symbol: string, over: Partial<DispatchAnalyst> = {}): DispatchAnalyst => ({ symbol, status: 'active', summary: 'Low debt. Profit fell sharply.', ...over });

describe('buildDispatch grouping', () => {
  it('puts medium/high alerts, thesis breaches and negative results under attention, most urgent first', () => {
    const d = buildDispatch(
      [analyst('ACC'), analyst('PNB'), analyst('IGL')],
      [
        entry('PNB', { kind: 'price', title: 'Big drop', alert: 'high' }),
        entry('ACC', { kind: 'earnings', title: 'Profit fell', impact: 'negative' }),
        entry('IGL', { kind: 'thesis', title: 'ROCE below floor' }),
      ],
      NOW
    )!;
    expect(d.attention.map((i) => i.title)).toEqual(['Big drop', 'Profit fell', 'ROCE below floor']);
    expect(d.catalysts).toEqual([]);
    expect(d.title).toBe('Morning brief: 3 items need a look');
    expect(d.day).toBe('2026-11-12');
  });

  it('puts 52-week highs, good results and plain news under catalysts', () => {
    const d = buildDispatch(
      [analyst('PNB'), analyst('ACC'), analyst('IGL')],
      [entry('PNB', { kind: 'range', title: 'At its 52-week high' }), entry('ACC', { kind: 'earnings', title: 'Results out', impact: 'positive' }), entry('IGL', { kind: 'news', title: 'Gas price cut' })],
      NOW
    )!;
    expect(d.attention).toEqual([]);
    expect(d.catalysts.map((i) => i.symbol).sort()).toEqual(['ACC', 'IGL', 'PNB']);
    expect(d.title).toBe('Morning brief: overnight developments on your holdings');
  });

  it('treats a positive big move as a catalyst, not a risk', () => {
    const d = buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'price', alert: 'high', impact: 'positive', title: 'Up 9%' })], NOW)!;
    expect(d.attention).toEqual([]);
    expect(d.catalysts.map((i) => i.title)).toEqual(['Up 9%']);
  });

  it('treats a 52-week low as attention', () => {
    const d = buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'range', alert: 'medium', title: 'At its 52-week low' })], NOW)!;
    expect(d.attention.map((i) => i.title)).toEqual(['At its 52-week low']);
  });

  it('files routine low-alert price and volume logs as quiet, never as a reason to send a brief', () => {
    const routine = [entry('ACC', { kind: 'price', title: 'Routine Market Price Tracking Update' }), entry('ACC', { kind: 'volume', title: 'Volume 2.1x average' })];
    expect(buildDispatch([analyst('ACC')], routine, NOW)).toBeNull();
    const d = buildDispatch([analyst('ACC'), analyst('PNB')], [...routine, entry('PNB', { kind: 'price', alert: 'high', title: 'Big drop' })], NOW)!;
    expect(d.quiet.map((q) => q.symbol)).toEqual(['ACC']);
    expect(d.attention.map((i) => i.symbol)).toEqual(['PNB']);
  });

  it('treats an entry the analyst itself titled "Routine ..." as quiet even when it was rated medium', () => {
    const d = buildDispatch(
      [analyst('ACC'), analyst('IGL'), analyst('PNB')],
      [entry('ACC', { kind: 'price', alert: 'medium', title: 'Routine Market Price Tracking Update' }), entry('IGL', { kind: 'news', title: 'Routine Coverage and Earnings Call Rescheduling' }), entry('PNB', { kind: 'earnings', title: 'Results out' })],
      NOW
    )!;
    expect(d.attention).toEqual([]);
    expect(d.catalysts.map((i) => i.symbol)).toEqual(['PNB']);
    expect(d.quiet.map((q) => q.symbol)).toEqual(['ACC', 'IGL']);
    expect(buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'price', alert: 'medium', title: 'Routine Market Price Tracking Update' })], NOW)).toBeNull();
  });

  it('never treats a thesis breach as routine, whatever its title', () => {
    const d = buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'thesis', title: 'Routine check: ROCE below floor' })], NOW)!;
    expect(d.attention).toHaveLength(1);
  });

  it('lists every active analyst with nothing material under quiet, with a one-sentence reminder', () => {
    const d = buildDispatch([analyst('ACC'), analyst('PNB'), analyst('NEW', { summary: null })], [entry('PNB', { kind: 'earnings', title: 'Results out' })], NOW)!;
    expect(d.quiet).toEqual([
      { symbol: 'ACC', text: 'Low debt.' },
      { symbol: 'NEW', text: '' },
    ]);
    expect(d.analystCount).toBe(3);
  });

  it('is null with no active analysts, and null when nothing material happened (no empty emails)', () => {
    expect(buildDispatch([analyst('ACC', { status: 'paused' })], [entry('ACC', { alert: 'high' })], NOW)).toBeNull();
    expect(buildDispatch([analyst('ACC')], [], NOW)).toBeNull();
    expect(buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'initiation', alert: 'high' })], NOW)).toBeNull();
  });

  it('only looks at the last 24 hours and ignores future or paused-analyst entries', () => {
    const d = buildDispatch([analyst('ACC'), analyst('OFF', { status: 'paused' })], [entry('ACC', { title: 'Old', ts: '2026-11-10T02:59:00Z' }), entry('ACC', { title: 'Fresh', ts: '2026-11-11T03:01:00Z' }), entry('OFF', { title: 'Paused one' })], NOW)!;
    expect(d.catalysts.map((i) => i.title)).toEqual(['Fresh']);
  });

  it('caps each section so one noisy day stays readable', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry('ACC', { title: `N${i}`, ts: `2026-11-11T1${i % 10}:00:00Z` }));
    expect(buildDispatch([analyst('ACC')], many, NOW)!.catalysts).toHaveLength(8);
  });
});

describe('weights and the pulse', () => {
  it('attaches the portfolio weight and ranks attention by urgency, then by weight', () => {
    const d = buildDispatch(
      [analyst('SMALL'), analyst('BIG')],
      [entry('SMALL', { kind: 'price', alert: 'medium', title: 'Small drop' }), entry('BIG', { kind: 'price', alert: 'medium', title: 'Big drop' })],
      NOW,
      { BIG: 22.4, SMALL: 1.1 }
    )!;
    expect(d.attention.map((i) => [i.symbol, i.weightPct])).toEqual([['BIG', 22.4], ['SMALL', 1.1]]);
  });

  it('leaves the weight null for a watcher with no holding', () => {
    const d = buildDispatch([analyst('ACC')], [entry('ACC', { alert: 'high', kind: 'price' })], NOW, {})!;
    expect(d.attention[0]?.weightPct).toBeNull();
  });

  it('writes a plain pulse naming the heaviest attention item and the counts', () => {
    const d = buildDispatch(
      [analyst('LAURUSLABS'), analyst('ICICIBANK'), analyst('ACC')],
      [entry('LAURUSLABS', { kind: 'price', alert: 'high', title: 'LAURUSLABS moved -8.4% to ₹812' }), entry('ICICIBANK', { kind: 'news', title: 'Added to a focus list' })],
      NOW,
      { LAURUSLABS: 22.4 }
    )!;
    expect(d.pulse).toBe('1 of your 3 analysts needs attention today. Start with LAURUSLABS (22.4% of your portfolio): LAURUSLABS moved -8.4% to ₹812. 1 has a positive or neutral development. 1 logged nothing material.');
  });

  it('says so when nothing needs attention', () => {
    const d = buildDispatch([analyst('ACC'), analyst('PNB')], [entry('PNB', { kind: 'earnings', title: 'Results out' })], NOW)!;
    expect(d.pulse).toBe('Nothing needs attention today. 1 has a positive or neutral development. 1 logged nothing material.');
  });
});

describe('portfolioWeights', () => {
  it('weights each holding by quantity x price over the whole portfolio, to one decimal', () => {
    const w = portfolioWeights(
      [
        { symbol: 'AAA', quantity: 10 },
        { symbol: 'BBB', quantity: 30 },
      ],
      { AAA: 100, BBB: 100 }
    );
    expect(w).toEqual({ AAA: 25, BBB: 75 });
  });
  it('skips holdings with no usable price, and sums a symbol held twice', () => {
    const w = portfolioWeights(
      [
        { symbol: 'AAA', quantity: 1 },
        { symbol: 'AAA', quantity: 1 },
        { symbol: 'BBB', quantity: 5 },
      ],
      { AAA: 50 }
    );
    expect(w).toEqual({ AAA: 100 });
    expect(portfolioWeights([], {})).toEqual({});
  });
});

describe('upgradeDispatch', () => {
  it('turns a brief saved in the old shape into the new one', () => {
    const d = upgradeDispatch({ day: '2026-11-11', title: 'Morning brief: 1 item needs a look', priority: [{ symbol: 'ACC', kind: 'earnings', alert: 'low', title: 'Results out' }], developments: [{ symbol: 'IGL', kind: 'news', alert: 'low', title: 'Gas cut' }], highlights: [{ symbol: 'PNB', text: 'Low debt.' }], analystCount: 3 });
    expect(d.attention).toEqual([{ symbol: 'ACC', kind: 'earnings', alert: 'low', title: 'Results out', impact: null, weightPct: null }]);
    expect(d.catalysts.map((i) => i.symbol)).toEqual(['IGL']);
    expect(d.quiet).toEqual([{ symbol: 'PNB', text: 'Low debt.' }]);
    expect(d.pulse).toContain('needs attention today');
  });
  it('returns a new-shape brief unchanged', () => {
    const d = buildDispatch([analyst('ACC')], [entry('ACC', { kind: 'earnings' })], NOW)!;
    expect(upgradeDispatch(d)).toBe(d);
  });
});

describe('renderDispatchText', () => {
  it('leads with the pulse, then the sections that exist, then the quiet list and the not-advice line', () => {
    const d = buildDispatch([analyst('ACC'), analyst('PNB')], [entry('ACC', { kind: 'price', alert: 'high', title: 'Big drop' })], NOW, { ACC: 12.5 })!;
    const t = renderDispatchText(d);
    expect(t.split('\n')[0]).toBe(d.pulse);
    expect(t).toContain('Requires attention\n- ACC (12.5%): Big drop');
    expect(t).not.toContain('Catalysts');
    expect(t).toContain('Quiet holdings (1): PNB');
    expect(t).toMatch(/From 2 analysts, built from public data\. Not investment advice\.$/);
  });
});
