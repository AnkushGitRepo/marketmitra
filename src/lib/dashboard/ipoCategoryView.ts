import { allotmentOdds, applicationSizes, type CategoryOdds, type OddsCategory } from './ipoAllotmentOdds';
import type { Ipo } from './iposApi';

// What the IPO details show for the category-wise subscription (#285): the multiple per category, the smallest application and the
// estimated odds. Pure. Nothing here invents a figure: an unknown multiple is a dash, and the odds are labelled estimates by the card.

export interface CategoryRow {
  key: OddsCategory;
  label: string;
  subscribed: string;
  minApplication: string;
  odds: string;
}

export interface CategoryView {
  rows: CategoryRow[];
  /** QIB demand, shown beside the table (QIBs are not a retail category); null when unknown. */
  qib: string | null;
  /** The draw category (retail or small NII) with the better chance; null when neither is known. */
  bestChance: string | null;
  /** When the figures were read, in IST, e.g. "20 Nov, 17:56". */
  asOf: string | null;
}

const DASH = '—';
const LABELS: Record<OddsCategory, string> = { retail: 'Retail', snii: 'Small NII', bnii: 'Big NII' };

const rupees = (n: number): string => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const multiple = (n: number | null | undefined): string => (n === null || n === undefined || !Number.isFinite(n) ? DASH : `${n.toFixed(2)}x`);

function oddsText(o: CategoryOdds | null): string {
  if (!o) return DASH;
  if (o.value >= 1) return 'Full allotment';
  if (o.kind === 'share') return `≈ ${Math.round(o.value * 100)}% of your bid`;
  return `≈ 1 in ${(1 / o.value).toFixed(1)} (${Math.round(o.value * 100)}%)`;
}

function minApplication(o: CategoryOdds | null): string {
  if (!o || o.minLots === null || o.minInvestment === null) return DASH;
  return `${rupees(o.minInvestment)} (${o.minLots} ${o.minLots === 1 ? 'lot' : 'lots'})`;
}

const IST_STAMP = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });

function asOfText(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? null : IST_STAMP.format(at);
}

export function ipoCategoryView(ipo: Ipo): CategoryView | null {
  const sub = { retail: ipo.sub_retail ?? null, snii: ipo.sub_snii ?? null, bnii: ipo.sub_bnii ?? null, qib: ipo.sub_qib ?? null };
  if (sub.retail === null && sub.snii === null && sub.bnii === null) return null;

  const odds = allotmentOdds(sub, applicationSizes({ price: ipo.price, lotSize: ipo.lot_size }));
  const rows = (['retail', 'snii', 'bnii'] as const).map(
    (key): CategoryRow => ({ key, label: LABELS[key], subscribed: multiple(sub[key]), minApplication: minApplication(odds[key]), odds: oddsText(odds[key]) })
  );
  return { rows, qib: sub.qib === null ? null : multiple(sub.qib), bestChance: odds.bestChance === null ? null : LABELS[odds.bestChance], asOf: asOfText(ipo.sub_as_of) };
}
