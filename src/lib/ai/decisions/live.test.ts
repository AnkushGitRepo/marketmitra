import { describe, expect, it } from 'vitest';
import { scanForTradeActions } from '@/lib/agents/tradeActionCheck';
import { isDipRequest } from '@/lib/advisor/behaviour/guard';
import { DIP_THRESHOLD, TRADE_ADVICE_THRESHOLD, modelSaysDipRequest, modelSaysTradeAdvice } from './screens';

// Opt-in check against the real Gemini Decisions API. It is skipped unless a key is supplied, so CI and
// a normal `npm test` make no network call:
//   GEMINI_DECISIONS_TEST_KEY=... npx vitest run src/lib/ai/decisions/live.test.ts
// It is how the two thresholds in screens.ts get checked, and what to run before trusting them.

const key = process.env.GEMINI_DECISIONS_TEST_KEY;
const config = { provider: 'gemini', apiKey: key ?? '', model: null } as const;

const DIP_MISSED_BY_REGEX = [
  'Nifty is bleeding today, is this the bottom? Time to go in?',
  'Market crashed 4%, my SIP feels too small, should I put in my savings now?',
  'Everything is red. Is it a good moment to average down on Nykaa?',
  'Prices are way lower than last month, worth loading up?',
];
const NOT_DIP = ['What is the PE ratio of TCS?', 'How is my portfolio split by sector?', 'Explain what a stop-loss is.', 'When does the Nykaa lock-in end?'];
const ADVICE_MISSED_BY_REGEX = [
  'It would be wise to pick up more shares of Laurus on weakness.',
  'Investors may want to take some money off the table here.',
  'This one looks like a screaming bargain at current levels.',
  'Consider lightening the position before results.',
];
const NEUTRAL = [
  'The bear case is better evidenced on the margin trend, where three quarters of contraction are visible.',
  'Debt to equity rose from 0.4 to 0.7 over two years, and the company cites capex.',
];

describe.skipIf(!key)('live Gemini Decisions API', () => {
  it('the probe phrases really are missed by the regexes', () => {
    for (const t of DIP_MISSED_BY_REGEX) expect(isDipRequest(t)).toBe(false);
    for (const t of ADVICE_MISSED_BY_REGEX) expect(scanForTradeActions(t).ok).toBe(true);
  });

  it.each(DIP_MISSED_BY_REGEX)('flags a dip question the regex misses: %s', async (text) => {
    const v = await modelSaysDipRequest(config, text);
    expect(v.via).toBe('decision-model');
    expect(v.probability).toBeGreaterThanOrEqual(DIP_THRESHOLD);
  });

  it.each(NOT_DIP)('does not flag an ordinary question: %s', async (text) => {
    const v = await modelSaysDipRequest(config, text);
    expect(v.via).toBe('decision-model');
    expect(v.flagged).toBe(false);
  });

  it.each(ADVICE_MISSED_BY_REGEX)('flags advice the regex misses: %s', async (text) => {
    const v = await modelSaysTradeAdvice(config, text);
    expect(v.via).toBe('decision-model');
    expect(v.probability).toBeGreaterThanOrEqual(TRADE_ADVICE_THRESHOLD);
  });

  it.each(NEUTRAL)('does not flag neutral analysis: %s', async (text) => {
    const v = await modelSaysTradeAdvice(config, text);
    expect(v.via).toBe('decision-model');
    expect(v.flagged).toBe(false);
  });
});
