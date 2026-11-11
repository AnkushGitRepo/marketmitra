// The six headline numbers under the stock hero. Only values we actually have; a gap is an em dash.

import type { PeerOut, RatioOut } from '@/lib/dashboard/fundamentalsApi';

export interface KeyTile {
  label: string;
  value: string;
  /** Short note on where a derived number comes from. */
  hint?: string;
}

const DASH = '—';

const ratioNumber = (ratios: readonly RatioOut[], name: string): number | null => {
  const r = ratios.find((x) => x.name === name);
  if (!r || r.value === null) return null;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : null;
};

const times = (n: number | null) => (n === null ? DASH : `${n.toFixed(1)}x`);
const percent = (n: number | null) => (n === null ? DASH : `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`);

/** Median P/E of the other companies in the peer set (the target is excluded; non-positive or missing P/E ignored). */
export function medianPeerPe(peers: readonly PeerOut[]): number | null {
  const values = peers
    .filter((p) => !p.is_target)
    .map((p) => (p.pe === null ? NaN : Number(p.pe)))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
}

interface BuildArgs {
  ratios: readonly RatioOut[];
  peers: readonly PeerOut[];
  /** Live price when known, else the scraped current price is used for P/B. */
  price: number | null;
}

export function buildKeyTiles({ ratios, peers, price }: BuildArgs): KeyTile[] {
  const marketCap = ratioNumber(ratios, 'Market Cap');
  const book = ratioNumber(ratios, 'Book Value');
  const px = price ?? ratioNumber(ratios, 'Current Price');
  const pb = book !== null && book > 0 && px !== null ? px / book : null;
  const peerPe = medianPeerPe(peers);

  return [
    // The data source reports market cap in rupees crore.
    { label: 'Market cap', value: marketCap === null ? DASH : `₹${marketCap.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` },
    { label: 'P/E', value: times(ratioNumber(ratios, 'Stock P/E')) },
    { label: 'P/B', value: times(pb), hint: 'Price ÷ book value' },
    { label: 'Peer median P/E', value: times(peerPe), hint: 'Median of the listed peers' },
    { label: 'Dividend yield', value: percent(ratioNumber(ratios, 'Dividend Yield')) },
    { label: 'ROE', value: percent(ratioNumber(ratios, 'ROE')) },
  ];
}
