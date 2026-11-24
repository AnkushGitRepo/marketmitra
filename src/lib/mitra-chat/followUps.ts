// Follow-up chips (#339): Mitra ends an answer with a small block of two or three things the user might ask next, and the chat shows them as
// chips. It is plain text in the reply, not a tool call: a tool call placed after the answer text cut the Gemini stream off in live runs.
// Pure helpers, so they test without mocks.

export const FOLLOW_UPS_OPEN = '<follow_ups>';
export const FOLLOW_UPS_CLOSE = '</follow_ups>';
export const FOLLOW_UPS_MIN = 2;
export const FOLLOW_UPS_MAX = 3;
const FOLLOW_UP_MIN_CHARS = 4;
const FOLLOW_UP_MAX_CHARS = 90;

export interface SplitReply {
  /** The reply without the follow-up block (or its unfinished start while the reply still streams). */
  readonly body: string;
  /** Two or three cleaned suggestions, or empty when the block is missing, unfinished or malformed. */
  readonly suggestions: readonly string[];
}

const BULLET = /^\s*(?:[-*•]|\d+[.)])\s*/;

function parseBlock(block: string): readonly string[] {
  const seen = new Set<string>();
  const items = block
    .split('\n')
    .map((line) => line.replace(BULLET, '').replace(/^["“]|["”]$/g, '').trim())
    .filter((line) => line.length >= FOLLOW_UP_MIN_CHARS && line.length <= FOLLOW_UP_MAX_CHARS)
    .filter((line) => !seen.has(line.toLowerCase()) && seen.add(line.toLowerCase()));
  return items.length >= FOLLOW_UPS_MIN ? items.slice(0, FOLLOW_UPS_MAX) : [];
}

/** Splits a reply into what to show and its follow-up suggestions. Safe on a half-streamed reply: the block is hidden as soon as it starts. */
export function splitFollowUps(text: string): SplitReply {
  const start = text.lastIndexOf(FOLLOW_UPS_OPEN);
  if (start === -1) return { body: text, suggestions: [] };
  const body = text.slice(0, start).trimEnd();
  const end = text.indexOf(FOLLOW_UPS_CLOSE, start);
  if (end === -1) return { body, suggestions: [] };
  return { body, suggestions: parseBlock(text.slice(start + FOLLOW_UPS_OPEN.length, end)) };
}
