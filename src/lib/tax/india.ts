// Indian capital-gains arithmetic for listed equity (#414). Pure: the date and prices are arguments. This is an
// estimate to help the user plan, not tax advice: it leaves out surcharge, cess, brokerage, STT and carried-forward
// losses. When the Budget changes a rate, change the constants below and RULES_AS_OF.

export const RULES_AS_OF = '23 July 2024 (Union Budget 2024)';
export const STCG_RATE = 0.2;
export const LTCG_RATE = 0.125;
export const LTCG_EXEMPTION = 125_000;
/** Listed equity becomes long term after this many months. */
export const LONG_TERM_MONTHS = 12;

export type Term = 'short' | 'long';

export interface Lot {
  readonly holdingId: string;
  readonly symbol: string;
  readonly quantity: number;
  readonly avgPrice: number;
  readonly ltp: number | null;
  /** YYYY-MM-DD, or null when the user has not said. */
  readonly purchaseDate: string | null;
}

export interface LotTax {
  readonly lot: Lot;
  /** Null when the purchase date or the live price is missing. */
  readonly term: Term | null;
  readonly heldDays: number | null;
  /** Days until the lot has been held more than 12 months; 0 once it has; null when the date is missing. */
  readonly daysToLongTerm: number | null;
  readonly gain: number | null;
}

const DAY_MS = 86_400_000;

/** A YYYY-MM-DD string as a UTC date, or null when it is not a real calendar date. */
export function parseDate(text: string | null): Date | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const d = new Date(`${text}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== text ? null : d;
}

export function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The same day `months` later; a 29–31 that does not exist there falls to the month's last day. */
export function addMonths(d: Date, months: number): Date {
  const total = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const year = Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)));
}

const dayDiff = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export function lotTax(lot: Lot, today: Date): LotTax {
  const bought = parseDate(lot.purchaseDate);
  const gain = lot.ltp === null ? null : lot.quantity * (lot.ltp - lot.avgPrice);
  if (!bought || bought.getTime() > today.getTime()) return { lot, term: null, heldDays: null, daysToLongTerm: null, gain };
  // More than 12 months: long term starts the day after the 12-month anniversary.
  const firstLongDay = new Date(addMonths(bought, LONG_TERM_MONTHS).getTime() + DAY_MS);
  const daysToLongTerm = Math.max(0, dayDiff(today, firstLongDay));
  return { lot, term: daysToLongTerm === 0 ? 'long' : 'short', heldDays: dayDiff(bought, today), daysToLongTerm, gain };
}

/** Tax on a year's net gains, after the loss set-off rules: a short-term loss can offset either kind of gain, a long-term loss only long-term gains. */
export function taxOn(shortTerm: number, longTerm: number): number {
  let st = shortTerm;
  let lt = longTerm;
  if (st < 0 && lt > 0) {
    const used = Math.min(-st, lt);
    st += used;
    lt -= used;
  }
  const taxableLong = Math.max(0, lt - LTCG_EXEMPTION);
  return Math.max(0, st) * STCG_RATE + taxableLong * LTCG_RATE;
}

export interface TaxSummary {
  readonly unrealisedShort: number;
  readonly unrealisedLong: number;
  /** Lots left out because the date or price is missing. */
  readonly unknownLots: number;
  /** Tax on the gains the user says they have already booked this year. */
  readonly taxOnBooked: number;
  /** Extra tax if every dated lot were also sold today. */
  readonly extraIfSoldToday: number;
}

export function summarise(lots: readonly LotTax[], bookedShort: number, bookedLong: number): TaxSummary {
  const sum = (term: Term) => lots.filter((l) => l.term === term && l.gain !== null).reduce((s, l) => s + (l.gain ?? 0), 0);
  const unrealisedShort = sum('short');
  const unrealisedLong = sum('long');
  const taxOnBooked = taxOn(bookedShort, bookedLong);
  return {
    unrealisedShort,
    unrealisedLong,
    unknownLots: lots.filter((l) => l.term === null || l.gain === null).length,
    taxOnBooked,
    extraIfSoldToday: taxOn(bookedShort + unrealisedShort, bookedLong + unrealisedLong) - taxOnBooked,
  };
}

export interface HarvestCandidate {
  readonly symbol: string;
  readonly term: Term;
  readonly loss: number;
  /** Tax the loss would save against the gains the user has booked this year, using the rates above. */
  readonly taxSaved: number;
}

/** Loss-making dated lots, biggest saving first. A candidate with no saving is kept so the user still sees the loss. */
export function harvestCandidates(lots: readonly LotTax[], bookedShort: number, bookedLong: number): HarvestCandidate[] {
  const base = taxOn(bookedShort, bookedLong);
  return lots
    .filter((l): l is LotTax & { term: Term; gain: number } => l.term !== null && l.gain !== null && l.gain < 0)
    .map((l) => {
      const loss = -l.gain;
      const after = l.term === 'short' ? taxOn(bookedShort - loss, bookedLong) : taxOn(bookedShort, bookedLong - loss);
      return { symbol: l.lot.symbol, term: l.term, loss, taxSaved: Math.max(0, base - after) };
    })
    .sort((a, b) => b.taxSaved - a.taxSaved || b.loss - a.loss);
}

/** The Indian financial year containing `today`: 1 April to 31 March. */
export function financialYear(today: Date): { readonly label: string; readonly end: Date; readonly daysLeft: number } {
  const y = today.getUTCFullYear();
  const startYear = today.getUTCMonth() >= 3 ? y : y - 1;
  const end = new Date(Date.UTC(startYear + 1, 2, 31));
  return { label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`, end, daysLeft: Math.max(0, dayDiff(today, end)) };
}
