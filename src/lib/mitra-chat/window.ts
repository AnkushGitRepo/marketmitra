import type { UIMessage } from 'ai';
import { CONTEXT_MAX_CHARS, CONTEXT_MAX_MESSAGES } from './limits';

/** Rough size of a message for window budgeting (tool parts count as a flat cost). */
export function messageChars(message: UIMessage): number {
  return message.parts.reduce((sum, p) => {
    if (p.type === 'text') return sum + p.text.length;
    if (p.type === 'file') return sum + 200;
    return sum + 400;
  }, 0);
}

export interface WindowPlan {
  /** Index of the first message sent to the model verbatim. */
  readonly keepFrom: number;
  /** Half-open range [from, to) of messages that must be folded into the summary. */
  readonly unsummarized: { readonly from: number; readonly to: number };
}

/**
 * Keeps the newest messages that fit both the count and character caps (always
 * at least the latest one) and starts the kept tail on a user turn so the model
 * never sees an orphaned assistant reply. `summarizedThrough` is how many
 * leading messages the stored summary already covers.
 */
export function planWindow(messages: readonly UIMessage[], summarizedThrough: number): WindowPlan {
  let keepFrom = messages.length;
  let chars = 0;
  while (keepFrom > 0) {
    const next = messageChars(messages[keepFrom - 1]);
    const count = messages.length - keepFrom;
    if (count >= CONTEXT_MAX_MESSAGES || (count > 0 && chars + next > CONTEXT_MAX_CHARS)) break;
    chars += next;
    keepFrom -= 1;
  }
  while (keepFrom < messages.length - 1 && messages[keepFrom].role !== 'user') keepFrom += 1;
  const from = Math.min(summarizedThrough, keepFrom);
  return { keepFrom, unsummarized: { from, to: keepFrom } };
}
