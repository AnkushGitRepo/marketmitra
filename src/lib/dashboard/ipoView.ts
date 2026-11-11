import type { Ipo } from './iposApi';
import { ipoPhase } from './ipoFilters';

// What an IPO card shows: status pill, GMP pill, subscription, minimum investment and the timeline. Pure and clock-free
// ("today" is passed in, as an IST YYYY-MM-DD string) so it tests without a browser or network. Nothing here invents a
// figure: a missing value is shown as missing.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
/** From this GMP percentage up, the premium gets the strongest styling. */
export const HOT_GMP_PCT = 20;
/** "Closes in N days" is shown as a warning inside this many days. */
const CLOSING_SOON_DAYS = 2;

function utcDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round(utcDay(to) - utcDay(from));
}

/** `2026-09-25` -> `25 Sep`; a missing date is a dash. */
export function fmtDay(iso: string | null): string {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** The source uses 0 for a price or size not announced yet; treat zero and negatives as missing, never as a real figure. */
export function known(n: number | null): number | null {
  return n !== null && n > 0 ? n : null;
}

export function priceText(ipo: Pick<Ipo, 'price'>): string {
  const price = known(ipo.price);
  return price === null ? '—' : fmtInr(price);
}

export function fmtInr(n: number, digits = 2): string {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: digits })}`;
}

export type BadgeTone = 'open' | 'closing' | 'upcoming' | 'closed' | 'allotted' | 'listed';

export interface StatusBadge {
  readonly label: string;
  readonly tone: BadgeTone;
}

const inDays = (n: number): string => (n === 1 ? 'tomorrow' : `in ${n} days`);

/** The pill that answers "is it open today, and when does bidding close?", from the dates rather than the source's status alone. */
export function ipoBadge(ipo: Pick<Ipo, 'status' | 'allotment_date' | 'open_date' | 'close_date'>, today: string): StatusBadge {
  const phase = ipoPhase(ipo, today);
  if (phase === 'listed') return { label: 'Listed', tone: 'listed' };
  if (phase === 'allotted') return { label: 'Allotment done', tone: 'allotted' };
  if (phase === 'closed') return { label: 'Closed', tone: 'closed' };

  if (phase === 'open') {
    if (ipo.open_date && today < ipo.open_date) return { label: `Opens ${inDays(daysBetween(today, ipo.open_date))}`, tone: 'upcoming' };
    if (!ipo.close_date) return { label: 'Open today', tone: 'open' };
    const left = daysBetween(today, ipo.close_date);
    if (left < 0) return { label: 'Closed', tone: 'closed' };
    if (left === 0) return { label: 'Closes today', tone: 'closing' };
    if (left <= CLOSING_SOON_DAYS) return { label: `Closes ${inDays(left)}`, tone: 'closing' };
    return { label: 'Open today', tone: 'open' };
  }

  if (!ipo.open_date) return { label: 'Upcoming', tone: 'upcoming' };
  const until = daysBetween(today, ipo.open_date);
  if (until < 0) return { label: 'Upcoming', tone: 'upcoming' };
  return { label: until === 0 ? 'Opens today' : `Opens ${inDays(until)}`, tone: 'upcoming' };
}

export type GmpTone = 'hot' | 'gain' | 'loss' | 'flat' | 'none';

export interface GmpView {
  readonly text: string;
  readonly tone: GmpTone;
}

/** The grey-market premium as the card's main anchor. No figure means "awaiting data", never zero. */
export function gmpView(ipo: Pick<Ipo, 'gmp' | 'gmp_pct'>): GmpView {
  if (ipo.gmp === null) return { text: 'GMP: awaiting data', tone: 'none' };
  const sign = ipo.gmp > 0 ? '+' : ipo.gmp < 0 ? '-' : '';
  const pct = ipo.gmp_pct === null ? '' : ` (${ipo.gmp_pct > 0 ? '+' : ipo.gmp_pct < 0 ? '-' : ''}${Math.abs(ipo.gmp_pct).toFixed(1)}%)`;
  const text = `${sign}${fmtInr(Math.abs(ipo.gmp))}${pct}`;
  if (ipo.gmp < 0) return { text, tone: 'loss' };
  if (ipo.gmp === 0) return { text, tone: 'flat' };
  return { text, tone: ipo.gmp_pct !== null && ipo.gmp_pct >= HOT_GMP_PCT ? 'hot' : 'gain' };
}

export type SubscriptionTone = 'over' | 'under' | 'none';

export function subscriptionView(ipo: Pick<Ipo, 'subscription_times'>): { readonly text: string; readonly tone: SubscriptionTone } {
  const x = ipo.subscription_times;
  if (x === null) return { text: '—', tone: 'none' };
  return { text: `${x.toLocaleString('en-IN', { maximumFractionDigits: 2 })}x`, tone: x >= 1 ? 'over' : 'under' };
}

/** One lot at the issue price, in rupees; null unless both are known. */
export function minInvestment(ipo: Pick<Ipo, 'price' | 'lot_size'>): number | null {
  const price = known(ipo.price);
  const lot = known(ipo.lot_size);
  return price !== null && lot !== null ? Math.round(price * lot) : null;
}

export function lotText(ipo: Pick<Ipo, 'price' | 'lot_size'>): string {
  const lot = known(ipo.lot_size);
  if (lot === null) return '—';
  const min = minInvestment(ipo);
  return min === null ? `${lot.toLocaleString('en-IN')} shares` : `${lot.toLocaleString('en-IN')} shares (${fmtInr(min, 0)})`;
}

export function issueSizeText(ipo: Pick<Ipo, 'ipo_size_cr'>): string {
  const size = known(ipo.ipo_size_cr);
  return size === null ? '—' : `${fmtInr(size, size >= 100 ? 0 : 1)} Cr`;
}

export type MilestoneState = 'done' | 'next' | 'later';

export interface Milestone {
  readonly id: 'bidding' | 'allotment' | 'listing';
  readonly label: string;
  readonly text: string;
  readonly state: MilestoneState;
}

/** Bidding, allotment and listing in order; finished steps are marked and the first unfinished one is "next". */
export function timeline(ipo: Pick<Ipo, 'open_date' | 'close_date' | 'allotment_date' | 'listing_date'>, today: string): Milestone[] {
  const steps = [
    { id: 'bidding', label: 'Bidding', text: ipo.open_date || ipo.close_date ? `${fmtDay(ipo.open_date)} – ${fmtDay(ipo.close_date)}` : '—', end: ipo.close_date },
    { id: 'allotment', label: 'Allotment', text: fmtDay(ipo.allotment_date), end: ipo.allotment_date },
    { id: 'listing', label: 'Listing', text: fmtDay(ipo.listing_date), end: ipo.listing_date },
  ] as const;
  let nextAssigned = false;
  return steps.map(({ end, ...step }) => {
    const done = end !== null && end < today;
    if (done) return { ...step, state: 'done' as const };
    if (!nextAssigned) {
      nextAssigned = true;
      return { ...step, state: 'next' as const };
    }
    return { ...step, state: 'later' as const };
  });
}
