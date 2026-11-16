import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalystContext } from './context';
import type { AnalystReport, DebateTurn } from './types';

const generateInsightText = vi.fn();
vi.mock('@/lib/ai/generate', () => ({ generateInsightText: (...a: unknown[]) => generateInsightText(...a) }));

vi.mock('@/lib/ai/decisions/screens', () => ({ tradeAdviceCheck: () => async () => false }));

const { runAnalysts, runDebateRound, runSynthesis, extractKeyClaims } = await import('./orchestrator');

const cfg = { provider: 'gemini', apiKey: 'k' } as never;
const slice = (hadData: boolean, text = 'data') => ({ text, hadData });
const fullCtx: AnalystContext = {
  fundamentals: slice(true),
  news_sentiment: slice(true),
  technical: slice(true),
  macro: slice(true),
};
const reports: AnalystReport[] = [
  { role: 'fundamentals', text: 'F', hadData: true },
  { role: 'technical', text: 'T', hadData: true },
];

beforeEach(() => {
  generateInsightText.mockReset();
  generateInsightText.mockResolvedValue({ ok: true, text: 'ok', model: 'm' });
});

describe('runAnalysts', () => {
  it('calls the model once per role that has data', async () => {
    const out = await runAnalysts(cfg, fullCtx);
    expect(Array.isArray(out)).toBe(true);
    expect(generateInsightText).toHaveBeenCalledTimes(4);
  });

  it('short-circuits a no-data role without a model call', async () => {
    const ctx = { ...fullCtx, macro: slice(false, 'no macro data') };
    const out = (await runAnalysts(cfg, ctx)) as AnalystReport[];
    expect(generateInsightText).toHaveBeenCalledTimes(3);
    expect(out.find((r) => r.role === 'macro')).toEqual({
      role: 'macro',
      text: 'no macro data',
      hadData: false,
    });
  });

  it('surfaces a phase error when a role fails', async () => {
    generateInsightText.mockResolvedValueOnce({ ok: false, error: 'quota' });
    const out = await runAnalysts(cfg, fullCtx);
    expect(out).toHaveProperty('error');
  });
});

describe('runDebateRound', () => {
  it('runs bull then bear, and the bear sees the bull turn', async () => {
    generateInsightText
      .mockResolvedValueOnce({ ok: true, text: 'BULL SAYS', model: 'm' })
      .mockResolvedValueOnce({ ok: true, text: 'bear rebuttal', model: 'm' });
    const out = (await runDebateRound(cfg, reports, [], 1)) as [DebateTurn, DebateTurn];
    expect(out[0]).toEqual({ side: 'bull', round: 1, text: 'BULL SAYS' });
    expect(out[1]).toMatchObject({ side: 'bear', round: 1 });
    const bearPrompt = generateInsightText.mock.calls[1][2] as string;
    expect(bearPrompt).toContain('BULL SAYS');
  });

  it('includes prior turns in the context', async () => {
    const prior: DebateTurn[] = [{ side: 'bull', round: 1, text: 'earlier bull' }];
    await runDebateRound(cfg, reports, prior, 2);
    expect(generateInsightText.mock.calls[0][2]).toContain('earlier bull');
  });

  it('returns a phase error if the bull call fails', async () => {
    generateInsightText.mockResolvedValueOnce({ ok: false, error: 'boom' });
    expect(await runDebateRound(cfg, reports, [], 1)).toHaveProperty('error');
  });
});

describe('runSynthesis', () => {
  const debate: DebateTurn[] = [{ side: 'bull', round: 1, text: 'b' }];

  it('returns the briefing when it passes the trade-action check', async () => {
    generateInsightText.mockResolvedValue({
      ok: true,
      text: 'The bear case is better evidenced on margins.',
      model: 'm',
    });
    const out = await runSynthesis(cfg, reports, debate);
    expect(out).toEqual({ briefing: 'The bear case is better evidenced on margins.', regenerated: false });
    expect(generateInsightText).toHaveBeenCalledTimes(1);
  });

  it('regenerates once when the first draft contains trade-action phrasing', async () => {
    generateInsightText
      .mockResolvedValueOnce({ ok: true, text: 'We would recommend investors to buy the stock.', model: 'm' })
      .mockResolvedValueOnce({ ok: true, text: 'A neutral assessment of the arguments.', model: 'm' });
    const out = (await runSynthesis(cfg, reports, debate)) as { briefing: string; regenerated: boolean };
    expect(out.regenerated).toBe(true);
    expect(out.briefing).toBe('A neutral assessment of the arguments.');
    expect(generateInsightText).toHaveBeenCalledTimes(2);
  });
});

describe('runSynthesis with the decision-model check', () => {
  const debate: DebateTurn[] = [{ side: 'bull', round: 1, text: 'b' }];

  it('regenerates a draft the regex passes but the model reads as advice', async () => {
    generateInsightText
      .mockResolvedValueOnce({ ok: true, text: 'It would be wise to pick up more shares on weakness.', model: 'm' })
      .mockResolvedValueOnce({ ok: true, text: 'A neutral assessment of the arguments.', model: 'm' });
    const screen = vi.fn(async () => true);
    const out = (await runSynthesis(cfg, reports, debate, undefined, screen)) as { briefing: string; regenerated: boolean };
    expect(out.regenerated).toBe(true);
    expect(generateInsightText).toHaveBeenCalledTimes(2);
    expect(screen).toHaveBeenCalledTimes(1);
  });

  it('keeps a draft both checks accept', async () => {
    generateInsightText.mockResolvedValue({ ok: true, text: 'The bear case is better evidenced on margins.', model: 'm' });
    const out = await runSynthesis(cfg, reports, debate, undefined, async () => false);
    expect(out).toEqual({ briefing: 'The bear case is better evidenced on margins.', regenerated: false });
    expect(generateInsightText).toHaveBeenCalledTimes(1);
  });

  it('does not ask the model when the regex already caught the draft', async () => {
    generateInsightText
      .mockResolvedValueOnce({ ok: true, text: 'We would recommend investors to buy the stock.', model: 'm' })
      .mockResolvedValueOnce({ ok: true, text: 'Neutral.', model: 'm' });
    const screen = vi.fn(async () => false);
    await runSynthesis(cfg, reports, debate, undefined, screen);
    expect(screen).not.toHaveBeenCalled();
  });
});

describe('extractKeyClaims', () => {
  it('parses a JSON object, tolerating a code fence', async () => {
    generateInsightText.mockResolvedValue({
      ok: true,
      text: '```json\n{"keyClaims":[{"side":"bear","claim":"margins are compressing"},{"side":"x","claim":"capex unproven"}]}\n```',
      model: 'm',
    });
    const out = await extractKeyClaims(cfg, 'brief', []);
    expect(out).toEqual([
      { side: 'bear', claim: 'margins are compressing' },
      { side: 'neutral', claim: 'capex unproven' },
    ]);
  });

  it('returns [] on unparseable output', async () => {
    generateInsightText.mockResolvedValue({ ok: true, text: 'not json at all', model: 'm' });
    expect(await extractKeyClaims(cfg, 'brief', [])).toEqual([]);
  });

  it('returns [] when the claims call itself fails', async () => {
    generateInsightText.mockResolvedValue({ ok: false, error: 'x' });
    expect(await extractKeyClaims(cfg, 'brief', [])).toEqual([]);
  });
});
