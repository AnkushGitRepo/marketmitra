// Recovers a structured reply the model wrapped in markdown (#314). Some models, free ones especially, answer a "return JSON" request
// with valid JSON inside a ```json fence, or with a sentence around it. The reply is still correct, so it is parsed and checked against
// the same schema instead of being thrown away. Pure: no model or network.

import type { z } from 'zod';

const FENCE = /```[A-Za-z]*[ \t]*\r?\n?([\s\S]*?)```/;

/** The first complete {...} or [...] in `text`, ignoring brackets inside string values; null when it never closes. */
function balancedSpan(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

const parses = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
};

/** The JSON text inside a model reply: from a code fence if there is one, else the first balanced object or array; null if none. */
export function extractJsonText(reply: string): string | null {
  const text = reply.trim();
  if (!text) return null;
  const fenced = FENCE.exec(text)?.[1]?.trim();
  for (const candidate of fenced ? [fenced, text] : [text]) {
    if (parses(candidate)) return candidate;
    const span = balancedSpan(candidate);
    if (span) return span;
  }
  return null;
}

/** The reply parsed and validated against `schema`, or null when it holds no JSON or the JSON does not match. */
export function recoverObject<S extends z.ZodTypeAny>(reply: string | undefined, schema: S): z.infer<S> | null {
  const json = reply ? extractJsonText(reply) : null;
  if (json === null) return null;
  try {
    const checked = schema.safeParse(JSON.parse(json));
    return checked.success ? checked.data : null;
  } catch {
    return null;
  }
}
