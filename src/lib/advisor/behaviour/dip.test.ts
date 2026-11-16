import { describe, expect, it, vi } from 'vitest';
import { detectDipRequest } from './dip';

const gemini = { provider: 'gemini', apiKey: 'k', model: null } as const;
const model = (flagged: boolean) => vi.fn(async () => ({ flagged, probability: flagged ? 0.9 : 0.1, via: 'decision-model' as const }));

describe('detectDipRequest', () => {
  it('trusts the regex and does not ask the model', async () => {
    const ask = model(false);
    expect(await detectDipRequest('Should I buy the dip in HDFC Bank?', gemini, ask)).toEqual({ dip: true, via: 'regex' });
    expect(ask).not.toHaveBeenCalled();
  });

  it('catches the phrasings the regexes miss when the model says yes', async () => {
    for (const text of [
      'Nifty is bleeding today, is this the bottom? Time to go in?',
      'Market crashed 4%, should I put in my savings now?',
      'Everything is red. Is it a good moment to average down on Nykaa?',
      'Prices are way lower than last month, worth loading up?',
    ]) {
      expect(await detectDipRequest(text, gemini, model(true))).toEqual({ dip: true, via: 'decision-model' });
    }
  });

  it('is not a dip question when neither the regex nor the model says so', async () => {
    expect(await detectDipRequest('What is the PE of TCS?', gemini, model(false))).toEqual({ dip: false, via: 'none' });
  });

  it('is the regex answer alone without a config', async () => {
    const ask = model(true);
    expect(await detectDipRequest('Nifty is bleeding today, is this the bottom?', null, ask)).toEqual({ dip: false, via: 'none' });
    expect(ask).not.toHaveBeenCalled();
  });
});
