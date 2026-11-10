import type { UIMessage } from 'ai';
import { generateInsightText } from '@/lib/ai/generate';
import type { AiConfig } from '@/lib/ai/providers';
import { SUMMARY_MAX_CHARS } from './limits';
import { transcriptOf } from './prepareMessages';

export const SUMMARY_SYSTEM = [
  'You compress the older part of an investing conversation into a running summary that will be given back to the assistant as background.',
  "Keep: the user's goals and constraints, facts they stated about their portfolio, specific numbers, tickers and dates, conclusions reached, documents they shared (name and what they showed) and open questions.",
  'Drop: pleasantries, repetition and anything superseded. Do not add opinions, advice or new facts. Plain text, no preamble, under 350 words.',
].join(' ');

export function buildSummaryPrompt(previousSummary: string, slice: readonly UIMessage[]): string {
  const prior = previousSummary.trim() ? `Existing summary:\n${previousSummary.trim()}\n\n` : '';
  return `${prior}New messages to fold into the summary:\n${transcriptOf(slice)}\n\nWrite the updated summary.`;
}

/** Folds `slice` into the running summary. Returns null if the model call fails — the caller then keeps the messages verbatim. */
export async function summariseSlice(
  config: AiConfig,
  previousSummary: string,
  slice: readonly UIMessage[]
): Promise<string | null> {
  if (slice.length === 0) return previousSummary;
  const result = await generateInsightText(config, SUMMARY_SYSTEM, buildSummaryPrompt(previousSummary, slice), {
    maxOutputTokens: 900,
  });
  return result.ok ? result.text.slice(0, SUMMARY_MAX_CHARS) : null;
}
