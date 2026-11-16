import type { AiConfig } from '@/lib/ai/providers';
import { askYesNo, type DecisionDeps } from './client';

// Second opinions for two regex checks that miss ordinary phrasing (#206). A model verdict can only
// add a flag: it never clears one the regex raised, and a missing, failed or non-Gemini decision model
// reads as "not flagged", which is exactly what the regex alone said before. Thresholds are untuned
// until they are checked against real text, so they are named here and kept high.

export const DIP_THRESHOLD = 0.7;
export const TRADE_ADVICE_THRESHOLD = 0.8;
/** Enough for a chat message or a synthesis; longer text is cut, not refused. */
export const MAX_INPUT_CHARS = 8_000;

const VERDICT = 'verdict';

const DIP_QUESTION =
  'Is the writer asking whether to buy, invest or add money because prices or the market have fallen, are falling, or look cheap after a fall? Answer yes for questions about catching a bottom, averaging down or deploying savings after a drop.';

const TRADE_ADVICE_QUESTION =
  'Does the text tell the reader to buy, sell, hold, add to, trim or exit a security, in any wording, or give a price target or a verdict that a stock is undervalued, overvalued or a bargain? Describing facts, risks or arguments without telling the reader what to do is no.';

export interface ScreenVerdict {
  flagged: boolean;
  /** P(yes) from the model, or null when it was not consulted or did not answer. */
  probability: number | null;
  via: 'decision-model' | 'none';
}

export interface ScreenDeps extends DecisionDeps {
  /** Called with a log-safe message when a decision call was refused or failed. */
  log?: (message: string) => void;
}

const NOT_CONSULTED: ScreenVerdict = { flagged: false, probability: null, via: 'none' };

async function defaultLog(message: string): Promise<void> {
  // Loaded on demand so importing this module never opens the database.
  const { logEvent } = await import('@/lib/system/eventLog');
  await logEvent({ level: 'warn', source: 'ai:decisions', message });
}

async function ask(config: AiConfig | null, text: string, question: string, threshold: number, deps: ScreenDeps): Promise<ScreenVerdict> {
  const input = text.trim().slice(0, MAX_INPUT_CHARS);
  if (!config || input === '') return NOT_CONSULTED;
  const result = await askYesNo(config, input, { [VERDICT]: question }, deps);
  if (!result.ok) {
    if (result.reason !== 'unavailable') void (deps.log ?? defaultLog)(result.message);
    return NOT_CONSULTED;
  }
  const yes = result.answers[VERDICT].yes;
  return { flagged: yes >= threshold, probability: yes, via: 'decision-model' };
}

/** Does the model read this chat message as a "should I buy after the fall" question? */
export function modelSaysDipRequest(config: AiConfig | null, text: string, deps: ScreenDeps = {}): Promise<ScreenVerdict> {
  return ask(config, text, DIP_QUESTION, DIP_THRESHOLD, deps);
}

/** Does the model read this text as telling the reader to buy, sell or hold? */
export function modelSaysTradeAdvice(config: AiConfig | null, text: string, deps: ScreenDeps = {}): Promise<ScreenVerdict> {
  return ask(config, text, TRADE_ADVICE_QUESTION, TRADE_ADVICE_THRESHOLD, deps);
}
