import type { AiConfig } from '@/lib/ai/providers';
import { modelSaysDipRequest, type ScreenVerdict } from '@/lib/ai/decisions/screens';
import { isDipRequest } from './guard';

export interface DipDetection {
  dip: boolean;
  via: 'regex' | 'decision-model' | 'none';
}

type AskModel = (config: AiConfig | null, text: string) => Promise<ScreenVerdict>;

/**
 * A "buy the dip" question by the regexes, or failing that by the decision model. The regex answer is
 * never overruled and costs no call; the model only adds questions the regexes miss. Without a Gemini
 * key, or if the call fails, this is the regex answer alone.
 */
export async function detectDipRequest(text: string, config: AiConfig | null, ask: AskModel = modelSaysDipRequest): Promise<DipDetection> {
  if (isDipRequest(text)) return { dip: true, via: 'regex' };
  if (!config) return { dip: false, via: 'none' };
  const verdict = await ask(config, text);
  return verdict.flagged ? { dip: true, via: 'decision-model' } : { dip: false, via: 'none' };
}
