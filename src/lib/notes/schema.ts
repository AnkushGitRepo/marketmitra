import { z } from 'zod';
import { MAX_RESEARCH_BODY, MAX_TICKERS, MAX_TITLE, MAX_BODY } from './limits';

const SYMBOL = z.string().trim().min(1).max(30);

/** The body of a note you write is capped at MAX_BODY; a saved research report gets MAX_RESEARCH_BODY. */
export const createNoteSchema = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE),
    body: z.string().trim().min(1).max(MAX_RESEARCH_BODY),
    symbol: z.string().trim().max(30).optional().nullable(),
    tickers: z.array(SYMBOL).max(MAX_TICKERS).optional(),
    source: z.enum(['manual', 'research']).optional(),
  })
  .refine((n) => (n.source ?? 'manual') === 'research' || n.body.length <= MAX_BODY, {
    message: `Note body must be at most ${MAX_BODY} characters`,
    path: ['body'],
  });

/** An edit: the source is not editable and the size limit is applied against the stored note. */
export const updateNoteSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE),
  body: z.string().trim().min(1).max(MAX_RESEARCH_BODY),
  symbol: z.string().trim().max(30).optional().nullable(),
  tickers: z.array(SYMBOL).max(MAX_TICKERS).optional(),
});
