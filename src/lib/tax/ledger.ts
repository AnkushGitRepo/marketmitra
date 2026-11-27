// What the tax page shows (#422): the four headline figures, and per-lot progress and tags. Pure, built on the rules in
// india.ts. Everything is an estimate and none of it is advice: the tags describe a lot's tax position, they do not
// tell the user to do anything.

import { LTCG_EXEMPTION, LTCG_RATE, STCG_RATE, taxOn, type LotTax, type Term } from './india';

/** A short-term lot this close to turning long term is called out. */
export const LONG_TERM_SOON_DAYS = 45;

const sum = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0);

export interface AllowanceCard {
  readonly allowance: number;
  /** Long-term gains the user says they have already booked this year (never below zero). */
  readonly booked: number;
  /** Long-term gains still unrealised on dated lots. */
  readonly unrealised: number;
  readonly remaining: number;
  /** Bar segments as a share of the allowance, each capped so the two together never pass 100. */
  readonly bookedPct: number;
  readonly unrealisedPct: number;
}

export function allowanceCard(lots: readonly LotTax[], bookedLong: number): AllowanceCard {
  const booked = Math.max(0, bookedLong);
  const unrealised = Math.max(0, sum(lots.filter((l) => l.term === 'long' && l.gain !== null).map((l) => l.gain ?? 0)));
  const bookedPct = Math.min(100, (booked / LTCG_EXEMPTION) * 100);
  const unrealisedPct = Math.min(100 - bookedPct, (unrealised / LTCG_EXEMPTION) * 100);
  return { allowance: LTCG_EXEMPTION, booked, unrealised, remaining: Math.max(0, LTCG_EXEMPTION - booked - unrealised), bookedPct, unrealisedPct };
}

export interface GainSplit {
  readonly short: number;
  readonly long: number;
  readonly total: number;
}

export function unrealisedSplit(lots: readonly LotTax[]): GainSplit {
  const of = (term: Term) => sum(lots.filter((l) => l.term === term && l.gain !== null).map((l) => l.gain ?? 0));
  const short = of('short');
  const long = of('long');
  return { short, long, total: short + long };
}

export interface HarvestPool {
  readonly lots: number;
  /** Sum of the unrealised losses on dated lots, as a positive number. */
  readonly loss: number;
  /** Estimated tax saved if all of those losses were realised against the gains already booked this year. */
  readonly taxShield: number;
}

export function harvestPool(lots: readonly LotTax[], bookedShort: number, bookedLong: number): HarvestPool {
  const losing = lots.filter((l): l is LotTax & { term: Term; gain: number } => l.term !== null && l.gain !== null && l.gain < 0);
  const shortLoss = sum(losing.filter((l) => l.term === 'short').map((l) => -l.gain));
  const longLoss = sum(losing.filter((l) => l.term === 'long').map((l) => -l.gain));
  return {
    lots: losing.length,
    loss: shortLoss + longLoss,
    taxShield: Math.max(0, taxOn(bookedShort, bookedLong) - taxOn(bookedShort - shortLoss, bookedLong - longLoss)),
  };
}

export interface LongTermSoon {
  readonly lots: number;
  /** Tax difference between selling these lots' gains as short term today and as long term once they qualify, before the exemption. */
  readonly rateGap: number;
}

export function longTermSoon(lots: readonly LotTax[], withinDays: number = LONG_TERM_SOON_DAYS): LongTermSoon {
  const soon = lots.filter((l) => l.term === 'short' && l.daysToLongTerm !== null && l.daysToLongTerm <= withinDays);
  return { lots: soon.length, rateGap: sum(soon.map((l) => Math.max(0, l.gain ?? 0) * (STCG_RATE - LTCG_RATE))) };
}

/** How far a lot is through its first year, 0 to 100; 100 once it is long term. Null without a date. */
export function yearProgressPct(lot: LotTax): number | null {
  if (lot.heldDays === null || lot.daysToLongTerm === null) return null;
  return lot.daysToLongTerm === 0 ? 100 : (lot.heldDays / (lot.heldDays + lot.daysToLongTerm)) * 100;
}

export type LotTag =
  | { readonly kind: 'date_missing' }
  | { readonly kind: 'loss'; readonly term: Term }
  | { readonly kind: 'long_term_soon'; readonly days: number }
  | { readonly kind: 'within_allowance' }
  | { readonly kind: 'none' };

/** The one note that fits a lot best. A loss wins, then a lot about to turn long term, then a long-term gain inside the allowance. */
export function lotTag(lot: LotTax, allowance: AllowanceCard): LotTag {
  if (lot.term === null || lot.gain === null) return { kind: 'date_missing' };
  if (lot.gain < 0) return { kind: 'loss', term: lot.term };
  if (lot.term === 'short' && lot.daysToLongTerm !== null && lot.daysToLongTerm <= LONG_TERM_SOON_DAYS) return { kind: 'long_term_soon', days: lot.daysToLongTerm };
  if (lot.term === 'long' && lot.gain > 0 && allowance.booked + allowance.unrealised <= allowance.allowance) return { kind: 'within_allowance' };
  return { kind: 'none' };
}
