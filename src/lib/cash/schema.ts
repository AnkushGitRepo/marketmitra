// Cash and liquid funds the user keeps outside their stock holdings (#413), so allocation shows the real mix.

import { z } from 'zod';

export const MAX_CASH_ENTRIES = 20;
export const MAX_LABEL = 60;
/** Far above any plausible balance; stops a typo from becoming an absurd total. */
export const MAX_AMOUNT = 1_000_000_000_000;

const amount = z.number().finite().min(0).max(MAX_AMOUNT);
const label = z.string().trim().min(1).max(MAX_LABEL);

export const createCashSchema = z.object({ label, amount });
export const updateCashSchema = z
  .object({ label: label.optional(), amount: amount.optional() })
  .refine((v) => v.label !== undefined || v.amount !== undefined, { message: 'Send label or amount' });

export interface CashEntry {
  readonly id: string;
  readonly label: string;
  readonly amount: number;
}

export const totalCash = (entries: readonly CashEntry[]): number => entries.reduce((s, e) => s + e.amount, 0);
