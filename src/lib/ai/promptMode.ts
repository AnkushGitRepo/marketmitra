// Prompt mode (ADR 0054). Mitra is guarded by default: no verdicts, no buy/sell calls (GUARDRAIL).
// A local-only, opt-in setting lets a self-hosted user switch the guardrail for opinion rules.
// The hosted deployment can never leave guarded mode, whatever is stored.

import { GUARDRAIL } from './prompts';

export type PromptMode = 'guarded' | 'unrestricted';

export const UNRESTRICTED_DISCLAIMER =
  'This is an AI opinion generated from public data, not licensed investment advice. You make the decision.';

export const UNRESTRICTED_RULES = [
  'You may give a reasoned view on valuation (whether the company looks undervalued, fairly valued or overvalued) and on whether the current price looks like a reasonable entry, using ONLY the data provided in the prompt (ratios, peers, price range, financials, news).',
  'Show the numbers behind the view and say what would change it. Never invent data; if the data is missing or mixed, say the view is unclear.',
  'Never promise or guarantee returns, and do not give position sizes or tell the user how much to invest.',
  'Be concise and specific. Plain language. No hype.',
  `End every response with exactly: "${UNRESTRICTED_DISCLAIMER}"`,
].join(' ');

/** Hosted always resolves to guarded; the stored setting is ignored there. */
export function selectPromptMode(args: { hosted: boolean; unrestricted: boolean }): PromptMode {
  return !args.hosted && args.unrestricted ? 'unrestricted' : 'guarded';
}

/**
 * `guarded` is a prompt built with `withGuardrail` (role text + GUARDRAIL). In unrestricted mode the
 * GUARDRAIL suffix is replaced by UNRESTRICTED_RULES; a prompt without that suffix is returned as is.
 */
export function promptForMode(guarded: string, mode: PromptMode): string {
  if (mode === 'guarded' || !guarded.endsWith(GUARDRAIL)) return guarded;
  return `${guarded.slice(0, guarded.length - GUARDRAIL.length)}${UNRESTRICTED_RULES}`;
}
