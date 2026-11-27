// Conviction board input rules (#411). A conviction entry hangs off a stock the user is watching: how sure they
// are, the price they would act at, and the note that holds the reasoning.

import { z } from 'zod';

export const CONVICTION_TAGS = ['high', 'tracking', 'wait'] as const;
export type ConvictionTag = (typeof CONVICTION_TAGS)[number];

export const TARGET_DIRECTIONS = ['at_or_below', 'at_or_above'] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];

export const MAX_WAIT_FOR = 60;
export const MAX_ENTRIES_PER_USER = 200;

const SYMBOL = z.string().trim().min(1).max(30).transform((s) => s.toUpperCase());

/** Fields a user can set. `null` clears an optional field; an omitted field is left as it is on update. */
export const convictionInputSchema = z
  .object({
    symbol: SYMBOL,
    tag: z.enum(CONVICTION_TAGS).optional(),
    waitFor: z.string().trim().max(MAX_WAIT_FOR).nullable().optional(),
    targetPrice: z.number().positive().finite().nullable().optional(),
    targetDirection: z.enum(TARGET_DIRECTIONS).optional(),
    noteId: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((v) => v.tag === 'wait' || !v.waitFor, {
    message: 'waitFor only applies to the "wait" tag',
    path: ['waitFor'],
  });

export type ConvictionInput = z.infer<typeof convictionInputSchema>;
