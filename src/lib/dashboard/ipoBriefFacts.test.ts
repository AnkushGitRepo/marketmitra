import { describe, expect, it } from 'vitest';
import type { Ipo } from './iposApi';
import { ipoBriefFacts, toneCounts } from './ipoBriefFacts';

const base: Ipo = {
  slug: 'acme',
  name: 'Acme Ltd',
  source_url: null,
  category: 'mainboard',
  status: 'open',
  price: 120,
  ipo_size_cr: 850.4,
  lot_size: 125,
  rating: null,
  subscription_times: 3.42,
  sub_qib: 6.1,
  sub_nii: null,
  sub_snii: 2.5,
  sub_bnii: 4,
  sub_retail: 1.2,
  sub_as_of: null,
  anchor: null,
  gmp: 15,
  gmp_pct: 12.5,
  gmp_low: null,
  gmp_high: null,
  gmp_updated_at: null,
  open_date: null,
  close_date: null,
  allotment_date: null,
  listing_date: '2026-12-05',
  source_tier: 't',
  fetched_at: '2026-11-24T00:00:00Z',
} as Ipo;

const tile = (facts: ReturnType<typeof ipoBriefFacts>, key: string) => facts.tiles.find((t) => t.key === key);

describe('ipoBriefFacts', () => {
  it('builds tiles from the IPO record, in rupees with Indian grouping', () => {
    const f = ipoBriefFacts(base);
    expect(tile(f, 'price')).toMatchObject({ value: '₹120', sub: 'Lot of 125 shares · min ₹15,000' });
    expect(tile(f, 'size')?.value).toBe('₹850 Cr');
    expect(tile(f, 'listing')?.value).toBe('5 Dec 2026');
    expect(tile(f, 'gmp')).toMatchObject({ value: '+12.5%', tone: 'positive', sub: '₹15 over the issue price' });
    expect(tile(f, 'subscribed')?.value).toBe('3.42x');
  });

  it('leaves out what it does not know rather than showing a made-up figure', () => {
    const f = ipoBriefFacts({ ...base, price: null, ipo_size_cr: null, lot_size: null, gmp: null, gmp_pct: null, subscription_times: null, listing_date: null });
    expect(f.tiles).toEqual([]);
  });

  it('shows a grey-market discount as a warning with its sign', () => {
    expect(tile(ipoBriefFacts({ ...base, gmp: -10, gmp_pct: -8.3 }), 'gmp')).toMatchObject({ value: '-8.3%', tone: 'warning' });
  });

  it('draws one bar per known category, scaled to the biggest, with the 1x mark', () => {
    const f = ipoBriefFacts(base);
    expect(f.bars.map((b) => b.key)).toEqual(['qib', 'bnii', 'snii', 'retail']);
    expect(f.bars[0]).toMatchObject({ label: 'QIB', display: '6.10x', widthPct: 100 });
    expect(f.bars[3].widthPct).toBeCloseTo((1.2 / 6.1) * 100, 5);
    expect(f.fullMarkPct).toBeCloseTo((1 / 6.1) * 100, 5);
    expect(f.bars.find((b) => b.key === 'retail')?.full).toBe(true);
  });

  it('scales to the 1x mark when nothing is covered, so a bar shows how close the category is to full', () => {
    const f = ipoBriefFacts({ ...base, sub_qib: 0.4, sub_snii: 0.2, sub_bnii: null, sub_retail: 0.5 });
    expect(f.bars.every((b) => !b.full)).toBe(true);
    expect(f.fullMarkPct).toBe(100);
    expect(f.bars.find((b) => b.key === 'retail')?.widthPct).toBe(50);
  });

  it('has no bars when no category figure is known', () => {
    expect(ipoBriefFacts({ ...base, sub_qib: null, sub_snii: null, sub_bnii: null, sub_retail: null }).bars).toEqual([]);
  });

  it('does not mutate the IPO', () => {
    const copy = JSON.parse(JSON.stringify(base));
    ipoBriefFacts(base);
    expect(base).toEqual(copy);
  });
});

describe('toneCounts', () => {
  const item = (tone: 'positive' | 'neutral' | 'warning') => ({ key: tone, tone, text: 't' });
  it('counts the AI items by tone in words', () => {
    expect(toneCounts([item('positive'), item('positive'), item('warning'), item('neutral')]).text).toBe('2 positive · 1 neutral · 1 to watch');
  });
  it('skips tones with no items and handles an empty list', () => {
    expect(toneCounts([item('neutral')]).text).toBe('1 neutral');
    expect(toneCounts([]).text).toBe('');
  });
});
