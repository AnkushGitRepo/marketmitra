import { z } from 'zod';
import { MAX_MEMORY_CHARS, MEMORY_KINDS, looksSensitive } from './rules';

/** A memory the user writes in Settings: a short fact, and never identity, bank or login details. */
export const memoryInputSchema = z.object({
  text: z
    .string()
    .trim()
    .min(4)
    .max(MAX_MEMORY_CHARS)
    .refine((t) => !looksSensitive(t), { message: 'Identity, bank and login details are never stored in memory.' }),
  kind: z.enum(MEMORY_KINDS).optional(),
});
export type MemoryInput = z.infer<typeof memoryInputSchema>;
