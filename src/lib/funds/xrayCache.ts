// A cached Mitra write-up is only shown while the findings it was written from are still the current ones, so
// an old "25% of your portfolio" never sits under a new tone. Pure: the hash is computed by the caller.

import { z } from 'zod';

const stored = z.object({ items: z.array(z.unknown()).min(1), inputHash: z.string().min(1) }).passthrough();

/** The write-up with the hash of the findings it was made from. An unreadable answer is returned as it came. */
export function stampWriteUp(content: string, inputHash: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? JSON.stringify({ ...parsed, inputHash }) : content;
  } catch {
    return content;
  }
}

/** The stored content if it was made from exactly these findings, else null (regenerate rather than show it). */
export function currentWriteUp(content: string | null | undefined, inputHash: string): string | null {
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const result = stored.safeParse(parsed);
  return result.success && result.data.inputHash === inputHash ? content : null;
}
