import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalystReport, DebateTurn } from './types';

// runSynthesis with its default decision-model hook, with only the network stubbed.

const generateInsightText = vi.fn();
vi.mock('@/lib/ai/generate', () => ({ generateInsightText: (...a: unknown[]) => generateInsightText(...a) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: vi.fn(async () => undefined) }));

const { runSynthesis } = await import('./orchestrator');

const gemini = { provider: 'gemini', apiKey: 'k', model: null } as never;
const reports: AnalystReport[] = [{ role: 'fundamentals', text: 'F', hadData: true }];
const debate: DebateTurn[] = [{ side: 'bull', round: 1, text: 'b' }];
const verdict = (p: number) => new Response(JSON.stringify({ answers: { verdict: { type: 'noul', noul: p, confidence: Math.max(p, 1 - p) } } }), { status: 200 });
const fetchStub = vi.fn<typeof fetch>();

beforeEach(() => {
  generateInsightText.mockReset();
  fetchStub.mockReset();
  vi.stubGlobal('fetch', fetchStub);
});

describe('runSynthesis default decision-model check', () => {
  it('sends the draft to Google and regenerates when it is flagged', async () => {
    fetchStub.mockResolvedValue(verdict(0.97));
    generateInsightText
      .mockResolvedValueOnce({ ok: true, text: 'It would be wise to pick up more shares on weakness.', model: 'm' })
      .mockResolvedValueOnce({ ok: true, text: 'A neutral assessment of the arguments.', model: 'm' });
    const out = (await runSynthesis(gemini, reports, debate)) as { briefing: string; regenerated: boolean };
    expect(out).toEqual({ briefing: 'A neutral assessment of the arguments.', regenerated: true });
    expect(JSON.parse((fetchStub.mock.calls[0] as [string, RequestInit])[1].body as string).input).toBe('It would be wise to pick up more shares on weakness.');
  });

  it('keeps a draft the model accepts', async () => {
    fetchStub.mockResolvedValue(verdict(0.02));
    generateInsightText.mockResolvedValue({ ok: true, text: 'The bear case is better evidenced on margins.', model: 'm' });
    expect(await runSynthesis(gemini, reports, debate)).toEqual({ briefing: 'The bear case is better evidenced on margins.', regenerated: false });
    expect(generateInsightText).toHaveBeenCalledTimes(1);
  });

  it('keeps the draft when Google fails: the regex result stands', async () => {
    fetchStub.mockResolvedValue(new Response('', { status: 503 }));
    generateInsightText.mockResolvedValue({ ok: true, text: 'The bear case is better evidenced on margins.', model: 'm' });
    expect((await runSynthesis(gemini, reports, debate) as { regenerated: boolean }).regenerated).toBe(false);
  });

  it('never calls Google for a user without a Gemini key', async () => {
    generateInsightText.mockResolvedValue({ ok: true, text: 'The bear case is better evidenced on margins.', model: 'm' });
    await runSynthesis({ provider: 'anthropic', apiKey: 'k', model: null } as never, reports, debate);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});
