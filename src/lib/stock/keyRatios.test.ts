import { describe, expect, it } from 'vitest';
import type { PeerOut, RatioOut } from '@/lib/dashboard/fundamentalsApi';
import { buildKeyTiles, medianPeerPe } from './keyRatios';

const ratio = (name: string, value: string | null, unit: string | null = null): RatioOut => ({ name, value, unit, as_of: '2026-11-11', source_tier: 't' });
const peer = (symbol: string, pe: string | null, is_target = false): PeerOut =>
  ({ symbol, name: symbol, is_target, pe, cmp: null, market_cap: null, div_yield: null, net_profit_qtr: null, qtr_profit_var_pct: null, sales_qtr: null, qtr_sales_var_pct: null, roce_pct: null, as_of: '', source_tier: '' }) as PeerOut;

describe('medianPeerPe', () => {
  it('takes the median of non-target peers with a positive P/E', () => {
    expect(medianPeerPe([peer('A', '10', true), peer('B', '6'), peer('C', '8'), peer('D', '100'), peer('E', null), peer('F', '-3')])).toBe(8);
  });
  it('averages the middle two for an even count and is null with no peers', () => {
    expect(medianPeerPe([peer('B', '6'), peer('C', '8')])).toBe(7);
    expect(medianPeerPe([peer('A', '10', true)])).toBeNull();
  });
});

describe('buildKeyTiles', () => {
  const ratios = [
    ratio('Market Cap', '987830', 'INR'),
    ratio('Stock P/E', '11.53'),
    ratio('Book Value', '728', 'INR'),
    ratio('Current Price', '1070', 'INR'),
    ratio('Dividend Yield', '1.66', '%'),
    ratio('ROE', '15.4', '%'),
  ];
  const peers = [peer('SBIN', '11.53', true), peer('PNB', '6.96'), peer('BOB', '5.91'), peer('CANBK', '5.92')];

  it('returns the six tiles in a fixed order with formatted values', () => {
    const tiles = buildKeyTiles({ ratios, peers, price: 1070 });
    expect(tiles.map((t) => t.label)).toEqual(['Market cap', 'P/E', 'P/B', 'Peer median P/E', 'Dividend yield', 'ROE']);
    expect(tiles.map((t) => t.value)).toEqual(['₹9,87,830 Cr', '11.5x', '1.5x', '5.9x', '1.66%', '15.4%']);
  });

  it('derives P/B from price and book value, and shows an em dash instead of inventing missing values', () => {
    const tiles = buildKeyTiles({ ratios: [ratio('Stock P/E', null)], peers: [], price: null });
    expect(tiles.map((t) => t.value)).toEqual(['—', '—', '—', '—', '—', '—']);
  });

  it('prefers the live price over the scraped current price for P/B', () => {
    const t = buildKeyTiles({ ratios, peers, price: 1456 });
    expect(t.find((x) => x.label === 'P/B')?.value).toBe('2.0x');
  });
});
