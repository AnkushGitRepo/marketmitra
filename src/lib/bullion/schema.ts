// Physical gold, silver and platinum the user holds (#454, ADR 0087), kept beside the stock holdings like cash.

import { z } from 'zod';

export const MAX_BULLION_ENTRIES = 30;
/** One tonne: far above anyone's holding, stops a typo from becoming an absurd value. */
export const MAX_GRAMS = 1_000_000;
export const MAX_PRICE_PER_GRAM = 10_000_000;
export const MAX_NOTE = 60;

export const METALS = ['gold', 'silver', 'platinum'] as const;
export type BullionMetal = (typeof METALS)[number];
export const GOLD_PURITIES = ['24k', '22k'] as const;
export type GoldPurity = (typeof GOLD_PURITIES)[number];

const grams = z.number().finite().positive().max(MAX_GRAMS);
const buyPrice = z.number().finite().positive().max(MAX_PRICE_PER_GRAM).nullable();
const note = z.string().trim().max(MAX_NOTE);

/** Purity only means something for gold; silver and platinum are 999. */
export const createBullionSchema = z
  .object({ metal: z.enum(METALS), purity: z.enum(GOLD_PURITIES).optional(), grams, buyPricePerGram: buyPrice.optional(), note: note.optional() })
  .refine((v) => v.metal === 'gold' || v.purity === undefined, { message: 'Purity applies to gold only', path: ['purity'] });

export const updateBullionSchema = z
  .object({ grams: grams.optional(), buyPricePerGram: buyPrice.optional(), purity: z.enum(GOLD_PURITIES).optional(), note: note.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Send something to change' });

export interface BullionEntry {
  readonly id: string;
  readonly metal: BullionMetal;
  /** 24k or 22k for gold; null for silver and platinum. */
  readonly purity: GoldPurity | null;
  readonly grams: number;
  /** What the user paid per gram, or null when they did not say (a gift, an inheritance). */
  readonly buyPricePerGram: number | null;
  readonly note: string | null;
}

/** The row of /api/commodities that prices this entry. */
export const priceRowId = (e: Pick<BullionEntry, 'metal' | 'purity'>): string =>
  e.metal === 'gold' ? (e.purity === '22k' ? 'gold-22k' : 'gold-24k') : e.metal === 'silver' ? 'silver-999' : 'platinum-999';

export const entryLabel = (e: Pick<BullionEntry, 'metal' | 'purity'>): string =>
  e.metal === 'gold' ? `Gold ${e.purity === '22k' ? '22K' : '24K'}` : e.metal === 'silver' ? 'Silver 999' : 'Platinum 999';
