import { z } from 'zod';
import type { ThesisBentoBlock } from './blocks';

const MAX_ITEMS = 6;
const list = z.array(z.string().trim().min(1)).max(MAX_ITEMS).default([]);

const thesisSchema = z.object({
  /** Markdown: the "What it is" and "Recent developments" sections. */
  summary: z.string().trim().min(1),
  catalysts: list,
  risks: list,
  questions: list,
});

export type Thesis = z.infer<typeof thesisSchema>;

/** The JSON object in a model reply (it may sit inside a code fence or after a sentence), or null when there is none. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * The prose of a reply that was cut off before its JSON closed: the text of the "summary" string, up to where it
 * stops. Null when the reply is not JSON-shaped, so ordinary markdown is never mistaken for this.
 */
export function salvageSummary(text: string): string | null {
  const match = /"summary"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(text);
  if (!match) return null;
  try {
    // A cut can land inside an escape such as \u00; drop it before decoding.
    const complete = match[1].replace(/\\(u[0-9a-fA-F]{0,3})?$/, '').replace(/\\$/, '');
    const decoded = (JSON.parse(`"${complete}"`) as string).trim();
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export function parseThesis(text: string): Thesis | null {
  const parsed = thesisSchema.safeParse(extractJson(text));
  return parsed.success ? parsed.data : null;
}

/** The three-column card; a column with nothing in it is left out. */
export function thesisBlock(thesis: Thesis): ThesisBentoBlock | null {
  const columns = [
    { title: 'Catalysts', tone: 'positive' as const, items: thesis.catalysts },
    { title: 'Risks and watch-items', tone: 'risk' as const, items: thesis.risks },
    { title: 'Open questions', tone: 'question' as const, items: thesis.questions },
  ].filter((c) => c.items.length > 0);
  return columns.length === 0 ? null : { type: 'thesis_bento', columns };
}
