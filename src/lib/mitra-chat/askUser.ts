// The `ask_user` tool lets Mitra pause and ask one clarifying question (#322). Pure helpers: the input schema,
// the text a card answer is sent as, and the checks the chat route and thread share. No I/O, so they test without mocks.

import { z } from 'zod';
import { hasProposal } from './holdingProposal';

export const ASK_USER_TOOL = 'ask_user';
export const ASK_MIN_OPTIONS = 2;
export const ASK_MAX_OPTIONS = 6;
const QUESTION_MAX = 200;
const LABEL_MAX = 60;
const DESCRIPTION_MAX = 140;

export const askUserInputSchema = z.object({
  question: z.string().trim().min(1).max(QUESTION_MAX),
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(LABEL_MAX),
        description: z.string().trim().max(DESCRIPTION_MAX).optional(),
      })
    )
    .min(ASK_MIN_OPTIONS)
    .max(ASK_MAX_OPTIONS),
  multiple: z.boolean().optional(),
});

export type AskUserInput = z.infer<typeof askUserInputSchema>;

/** The model's tool input as a validated question, or null while it is still streaming or if it is malformed. */
export function parseAskUserInput(input: unknown): AskUserInput | null {
  const parsed = askUserInputSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

/**
 * The user message sent when a card is answered. It repeats the question, because the tool call itself is
 * dropped from older turns before the model sees them, so the answer has to make sense on its own.
 */
export function answerText(question: string, picked: readonly string[], other?: string): string {
  const answers = [...picked, ...(other?.trim() ? [other.trim()] : [])];
  return `${question.trim()}\n${answers.join(', ')}`;
}

type PartLike = { readonly type: string; readonly text?: string; readonly output?: unknown };

/** True when a reply carries something worth saving: text, or a card for the user to answer (a question or a holding change). */
export function hasReplyContent(parts: readonly PartLike[]): boolean {
  return parts.some((p) => (p.type === 'text' && (p.text ?? '').trim().length > 0) || p.type === `tool-${ASK_USER_TOOL}`) || hasProposal(parts);
}

/** The question of the `ask_user` card in a message, if it has one. */
export function questionOfMessage(parts: readonly { readonly type: string; readonly input?: unknown }[]): string | null {
  const part = parts.find((p) => p.type === `tool-${ASK_USER_TOOL}`);
  return part ? (parseAskUserInput(part.input)?.question ?? null) : null;
}

/**
 * What to show in the user's bubble for a card answer: the answer alone, because the question is on the card just above.
 * Text that is not an answer to that question is returned unchanged.
 */
export function visibleAnswer(text: string, question: string | null): string {
  if (!question) return text;
  const prefix = `${question.trim()}\n`;
  return text.startsWith(prefix) && text.length > prefix.length ? text.slice(prefix.length) : text;
}
