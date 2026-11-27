import { describe, expect, it } from 'vitest';
import { buildCommodities, type RawInputs, type RawQuote } from '@/lib/commodities/rates';
import { COMMODITY_TOOL, buildCommodityTools } from './commodityTools';

const q = (price: number): RawQuote => ({ price, changePct: 1.2, week52High: price * 1.5, week52Low: price * 0.8, asOf: '2026-11-27T18:00:00.000Z' });
const raw: RawInputs = { futures: { gold: q(3672.7), silver: q(43.8), platinum: q(1312.4) }, usdInr: q(92.98), etfs: {} };

type Exec = { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> };
const tool = (data = buildCommodities(raw, new Date('2026-12-01T00:00:00Z'))) => (buildCommodityTools({ commodities: async () => data })[COMMODITY_TOOL] as unknown as Exec);

describe('get_commodity_prices', () => {
  it('returns all metals flagged as estimates, with the basis stated', async () => {
    const r = await tool().execute({});
    expect(r.available).toBe(true);
    expect(r.estimate).toBe(true);
    expect(String(r.basis)).toContain('15%');
    expect(String(r.basis)).toContain('Not the IBJA or MCX rate');
    expect((r.metals as unknown[]).length).toBe(4);
  });
  it('limits to one metal', async () => {
    const r = await tool().execute({ metal: 'silver' });
    expect((r.metals as { id: string }[]).map((m) => m.id)).toEqual(['silver-999']);
  });
  it('values a weight the user gave, in 24K by default and 22K on request', async () => {
    const r24 = (await tool().execute({ metal: 'gold', grams: 50 })).valuation as { estimatedValueInr: number };
    const r22 = (await tool().execute({ metal: 'gold', grams: 50, purity: '22k' })).valuation as { estimatedValueInr: number };
    expect(r24.estimatedValueInr).toBeGreaterThan(600000);
    expect(r22.estimatedValueInr / r24.estimatedValueInr).toBeCloseTo(916 / 999, 3);
  });
  it('asks which metal when only a weight is given', async () => {
    const r = await tool().execute({ grams: 10 });
    expect(r.valuation).toEqual({ error: 'say which metal the weight is' });
  });
  it('warns when the duty has not been confirmed for too long', async () => {
    const stale = buildCommodities(raw, new Date('2027-06-01T00:00:00Z'));
    expect(String((await tool(stale).execute({})).warning)).toContain('45 days');
  });
  it('reports unavailable, never made-up prices, when the source is down', async () => {
    const down = buildCommodities({ futures: { gold: null, silver: null, platinum: null }, usdInr: null, etfs: {} });
    expect((await tool(down).execute({})).available).toBe(false);
  });
  it('never uses advice wording in its description', () => {
    const description = (buildCommodityTools()[COMMODITY_TOOL] as unknown as { description: string }).description;
    expect(description).toMatch(/do not tell the user to buy or sell/);
  });
});
