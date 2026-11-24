import type { BriefItem } from '@/lib/ai/structuredBrief';
import type { Ipo } from './iposApi';

// The figures around an IPO brief (#328): fact tiles and subscription bars, read straight from the IPO record. The AI writes the sentences;
// nothing here comes from a model, and a value that is not known is left out, never filled in. Pure.

export type TileTone = 'positive' | 'warning';

export interface BriefTile {
  readonly key: 'price' | 'size' | 'listing' | 'gmp' | 'subscribed';
  readonly label: string;
  readonly value: string;
  readonly sub?: string;
  readonly tone?: TileTone;
}

export interface BriefBar {
  readonly key: 'qib' | 'bnii' | 'snii' | 'retail';
  readonly label: string;
  /** e.g. "6.10x". */
  readonly display: string;
  /** Bar length against the biggest category, 0-100. */
  readonly widthPct: number;
  /** Bid at least once over the shares on offer in this category. */
  readonly full: boolean;
}

export interface IpoBriefFacts {
  readonly tiles: readonly BriefTile[];
  readonly bars: readonly BriefBar[];
  /** Where "fully subscribed" (1x) sits on the bars, 0-100; null when there are no bars. */
  readonly fullMarkPct: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATEGORY_ORDER = [
  ['qib', 'QIB', 'sub_qib'],
  ['bnii', 'Big NII', 'sub_bnii'],
  ['snii', 'Small NII', 'sub_snii'],
  ['retail', 'Retail', 'sub_retail'],
] as const;

const known = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);
const rupees = (n: number): string => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const signed = (n: number, digits: number): string => `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;

function dayText(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month} ${m[1]}` : null;
}

export function ipoBriefFacts(ipo: Ipo): IpoBriefFacts {
  const tiles: BriefTile[] = [];

  if (known(ipo.price)) {
    const sub = known(ipo.lot_size) ? `Lot of ${ipo.lot_size} shares · min ${rupees(ipo.lot_size * ipo.price)}` : undefined;
    tiles.push({ key: 'price', label: 'Issue price', value: rupees(ipo.price), ...(sub ? { sub } : {}) });
  }
  if (known(ipo.ipo_size_cr)) tiles.push({ key: 'size', label: 'Issue size', value: `${rupees(ipo.ipo_size_cr)} Cr` });
  const listing = dayText(ipo.listing_date);
  if (listing) tiles.push({ key: 'listing', label: 'Listing', value: listing });
  if (known(ipo.gmp_pct)) {
    const sub = known(ipo.gmp) ? `${rupees(Math.abs(ipo.gmp))} ${ipo.gmp < 0 ? 'under' : 'over'} the issue price` : undefined;
    tiles.push({ key: 'gmp', label: 'Grey market', value: `${signed(ipo.gmp_pct, 1)}%`, ...(sub ? { sub } : {}), ...(ipo.gmp_pct > 0 ? { tone: 'positive' as const } : ipo.gmp_pct < 0 ? { tone: 'warning' as const } : {}) });
  }
  if (known(ipo.subscription_times)) tiles.push({ key: 'subscribed', label: 'Subscribed', value: `${ipo.subscription_times.toFixed(2)}x` });

  const figures = CATEGORY_ORDER.flatMap(([key, label, field]) => {
    const value = ipo[field];
    return known(value) ? [{ key, label, value }] : [];
  });
  const scale = Math.max(1, ...figures.map((f) => f.value));
  const bars = figures.map((f): BriefBar => ({ key: f.key, label: f.label, display: `${f.value.toFixed(2)}x`, widthPct: (f.value / scale) * 100, full: f.value >= 1 }));

  return { tiles, bars, fullMarkPct: bars.length > 0 ? (1 / scale) * 100 : null };
}

export interface ToneCounts {
  readonly positive: number;
  readonly neutral: number;
  readonly warning: number;
  /** "2 positive · 1 neutral · 1 to watch"; empty for no items. */
  readonly text: string;
}

export function toneCounts(items: readonly Pick<BriefItem, 'tone'>[]): ToneCounts {
  const count = (tone: BriefItem['tone']) => items.filter((i) => i.tone === tone).length;
  const positive = count('positive');
  const neutral = count('neutral');
  const warning = count('warning');
  const text = [positive && `${positive} positive`, neutral && `${neutral} neutral`, warning && `${warning} to watch`].filter(Boolean).join(' · ');
  return { positive, neutral, warning, text };
}
