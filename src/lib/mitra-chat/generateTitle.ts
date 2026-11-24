// A short, descriptive chat title written by the user's own model from the first question and answer (#341). The pure parts
// (prompt, clean-up) are separate from the model call so they test without mocks.

import type { UIMessage } from 'ai';
import { generateInsightText } from '@/lib/ai/generate';
import type { AiConfig } from '@/lib/ai/providers';
import { TITLE_MAX } from './limits';
import { transcriptOf } from './prepareMessages';

const EXCERPT_MESSAGES = 4;
const EXCERPT_CHARS = 1200;
const TITLE_WORDS_MAX = 8;

export const TITLE_SYSTEM = [
  'You write the title of a chat between an investor and their markets assistant, so the investor can find the chat later in a long list.',
  'Reply with the title only: 3 to 7 words, in the language the user wrote in, naming the company, stock, IPO or topic and what they wanted (for example "JIO IPO allotment and outlook" or "Is my portfolio too concentrated").',
  'No quotation marks, no trailing full stop, no emoji, no markdown, and no advice or verdict in the title.',
].join(' ');

/** The text of the first messages, trimmed, for the title prompt. */
export function buildTitlePrompt(messages: readonly UIMessage[]): string {
  return `Chat so far:\n${transcriptOf(messages.slice(0, EXCERPT_MESSAGES)).slice(0, EXCERPT_CHARS)}\n\nWrite the title.`;
}

/** True once the chat has a Mitra reply with text, so a title can describe more than the question. */
export function hasAnswerText(messages: readonly UIMessage[]): boolean {
  return messages.some((m) => m.role === 'assistant' && m.parts.some((p) => p.type === 'text' && p.text.trim().length > 0));
}

/** A model reply as a title: first line only, no label, quotes, markdown or end punctuation, a handful of words. Null if nothing usable is left. */
export function cleanTitle(raw: string): string | null {
  const line = raw.split('\n').find((l) => l.trim()) ?? '';
  const stripped = line
    .replace(/^\s*(?:chat\s+)?title\s*[:\-–]\s*/i, '')
    .replace(/[#*_`>~\[\]"“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.:;,!\-–\s]+$/, '')
    .trim();
  if (!stripped) return null;
  const words = stripped.split(' ');
  const clipped = words.length > TITLE_WORDS_MAX ? `${words.slice(0, TITLE_WORDS_MAX).join(' ')}…` : stripped;
  return clipped.length > TITLE_MAX ? `${clipped.slice(0, TITLE_MAX - 1).trimEnd()}…` : clipped;
}

/** Null when the model call fails or returns nothing usable; the caller then keeps the current title. */
export async function generateChatTitle(config: AiConfig, messages: readonly UIMessage[]): Promise<string | null> {
  const result = await generateInsightText(config, TITLE_SYSTEM, buildTitlePrompt(messages), { maxOutputTokens: 60 });
  return result.ok ? cleanTitle(result.text) : null;
}
