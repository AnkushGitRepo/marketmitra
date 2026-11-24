import { MessageProcessor } from '@a2ui/web_core';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { describe, expect, it } from 'vitest';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { BASIC_CATALOG_ID, buildPortfolioSnapshot } from './portfolioSnapshot';

const h = (symbol: string, quantity: number, avgPrice: number, ltp: number | null, sector: string | null = 'IT', dayChange: number | null = 1): HoldingLike => ({
  symbol,
  name: symbol,
  quantity,
  avgPrice,
  ltp,
  sector,
  dayChange,
});

const holdings = [h('INFY', 10, 1400, 1500), h('TCS', 5, 3000, 2900, 'IT', -10), h('HDFCBANK', 20, 1500, 1650, 'Banks')];

const textsOf = (messages: readonly unknown[]): string[] =>
  JSON.stringify(messages)
    .match(/"text":"[^"]*"/g)
    ?.map((t) => t.slice(8, -1)) ?? [];

describe('buildPortfolioSnapshot', () => {
  it('returns null when there are no holdings', () => {
    expect(buildPortfolioSnapshot([])).toBeNull();
  });

  it('shows the real totals, formatted in rupees', () => {
    const snap = buildPortfolioSnapshot(holdings)!;
    const texts = textsOf(snap.messages);
    // value 15000 + 14500 + 33000 = 62500; invested 14000 + 15000 + 30000 = 59000; P&L +3500 (+5.9%)
    expect(texts).toContain('₹62,500');
    expect(texts).toContain('₹59,000');
    expect(texts).toContain('+₹3,500 (+5.9%)');
  });

  it('lists the biggest holdings first with weight and return', () => {
    const texts = textsOf(buildPortfolioSnapshot(holdings)!.messages);
    expect(texts.indexOf('HDFCBANK')).toBeLessThan(texts.indexOf('INFY'));
    expect(texts).toContain('52.8%'); // 33000 / 62500
    expect(texts).toContain('+10.0%'); // HDFCBANK return on cost
  });

  it('caps the holdings list and says how many more there are', () => {
    const many = Array.from({ length: 8 }, (_, i) => h(`S${i}`, 1, 100, 100 + i));
    const texts = textsOf(buildPortfolioSnapshot(many)!.messages);
    expect(texts.filter((t) => /^S\d$/.test(t))).toHaveLength(5);
    expect(texts).toContain('+ 3 more holdings');
  });

  it('shows n/a rather than a made-up figure for a holding without a live price', () => {
    const snap = buildPortfolioSnapshot([h('INFY', 10, 1400, 1500), h('NOPRICE', 5, 100, null, null, null)])!;
    const texts = textsOf(snap.messages);
    expect(texts).toContain('n/a');
    expect(snap.summary).toMatch(/1 of 2 holdings have no live price/);
  });

  it('gives the model the same figures in a text summary', () => {
    const { summary } = buildPortfolioSnapshot(holdings)!;
    expect(summary).toContain('₹62,500');
    expect(summary).toContain('HDFCBANK');
    expect(summary).toMatch(/already shown to the user/i);
  });

  it('produces messages the real A2UI processor accepts, with a root component', () => {
    const snap = buildPortfolioSnapshot(holdings)!;
    const processor = new MessageProcessor([basicCatalog]);
    expect(() => processor.processMessages(snap.messages as never)).not.toThrow();
    expect(processor.model.surfacesMap.size).toBe(1);
    const root = JSON.stringify(snap.messages).includes('"id":"root"');
    expect(root).toBe(true);
  });

  it('leaves out the sector note when no holding has a known sector', () => {
    const unknown = [h('A', 1, 100, 110, null), h('B', 1, 100, 90, null)];
    const joined = JSON.stringify(buildPortfolioSnapshot(unknown)!.messages);
    expect(joined).not.toContain('Sector skew');
    expect(JSON.stringify(buildPortfolioSnapshot(holdings)!.messages)).toContain('Sector skew');
  });

  it('does not mutate its input', () => {
    const input = [...holdings];
    const copy = JSON.parse(JSON.stringify(input));
    buildPortfolioSnapshot(input);
    expect(input).toEqual(copy);
  });
});

it('uses the catalog id the real A2UI package defines', () => {
  expect(BASIC_CATALOG_ID).toBe(basicCatalog.id);
});
