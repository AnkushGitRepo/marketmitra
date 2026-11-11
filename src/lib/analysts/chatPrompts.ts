// Starter questions for the analyst chats (#131). They fill the composer; they are never sent automatically.

import type { PromptMode } from '@/lib/ai/promptMode';

export function analystStarters(symbol: string, mode: PromptMode = 'guarded'): string[] {
  const base = [`What changed for ${symbol} recently, and does it bear on the thesis?`, `What are the biggest weak points in ${symbol}'s numbers?`, `What is not in our data that would matter for ${symbol}?`];
  return mode === 'unrestricted' ? [...base.slice(0, 2), `Is ${symbol} undervalued at its current price? Show the numbers.`] : base;
}

export const ROOT_STARTERS: readonly string[] = [
  'Which of my holdings needs attention right now, and why?',
  'Which holdings look most exposed to weaker earnings, from the analysts\' notes?',
  'Compare my two most concentrated holdings.',
];
