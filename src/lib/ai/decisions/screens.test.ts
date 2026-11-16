import { describe, expect, it, vi } from 'vitest';
import { DIP_THRESHOLD, MAX_INPUT_CHARS, TRADE_ADVICE_THRESHOLD, modelSaysDipRequest, modelSaysTradeAdvice, tradeAdviceCheck } from './screens';

const gemini = { provider: 'gemini', apiKey: 'k', model: null } as const;
const answer = (p: number) => async () => new Response(JSON.stringify({ answers: { verdict: { type: 'noul', noul: p, confidence: Math.max(p, 1 - p) } } }), { status: 200 });

describe('modelSaysDipRequest', () => {
  it('flags a question at or above the threshold', async () => {
    const r = await modelSaysDipRequest(gemini, 'Nifty is bleeding, is this the bottom?', { fetch: vi.fn(answer(DIP_THRESHOLD)), log: vi.fn() });
    expect(r).toEqual({ flagged: true, probability: DIP_THRESHOLD, via: 'decision-model' });
  });

  it('does not flag below the threshold', async () => {
    const r = await modelSaysDipRequest(gemini, 'What is the PE of TCS?', { fetch: vi.fn(answer(0.05)), log: vi.fn() });
    expect(r).toMatchObject({ flagged: false, probability: 0.05, via: 'decision-model' });
  });

  it('falls back to "not flagged" and logs when the call fails', async () => {
    const log = vi.fn();
    const r = await modelSaysDipRequest(gemini, 'x', { fetch: vi.fn(async () => new Response('', { status: 500 })), log });
    expect(r).toEqual({ flagged: false, probability: null, via: 'none' });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('stays silent for a non-Gemini provider', async () => {
    const log = vi.fn();
    const fetchFn = vi.fn();
    expect(await modelSaysDipRequest({ provider: 'openrouter', apiKey: 'k', model: null }, 'x', { fetch: fetchFn, log })).toEqual({ flagged: false, probability: null, via: 'none' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('sends the message, capped in length', async () => {
    const fetchFn = vi.fn(answer(0.1));
    await modelSaysDipRequest(gemini, 'a'.repeat(50_000), { fetch: fetchFn, log: vi.fn() });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { input: string };
    expect(body.input.length).toBeLessThanOrEqual(8_000);
  });
});

describe('modelSaysTradeAdvice', () => {
  it('flags text the model reads as advice to buy, sell or hold', async () => {
    const r = await modelSaysTradeAdvice(gemini, 'It would be wise to pick up more shares on weakness.', { fetch: vi.fn(answer(TRADE_ADVICE_THRESHOLD + 0.05)), log: vi.fn() });
    expect(r.flagged).toBe(true);
  });

  it('leaves neutral text alone and treats a failure as not flagged', async () => {
    expect((await modelSaysTradeAdvice(gemini, 'Margins fell two points.', { fetch: vi.fn(answer(0.1)), log: vi.fn() })).flagged).toBe(false);
    expect(await modelSaysTradeAdvice(gemini, 'x', { fetch: vi.fn(async () => { throw new Error('down'); }), log: vi.fn() })).toEqual({ flagged: false, probability: null, via: 'none' });
  });

  it('does nothing without a config or for empty text', async () => {
    const fetchFn = vi.fn();
    expect(await modelSaysTradeAdvice(null, 'x', { fetch: fetchFn, log: vi.fn() })).toMatchObject({ flagged: false, via: 'none' });
    expect(await modelSaysTradeAdvice(gemini, '   ', { fetch: fetchFn, log: vi.fn() })).toMatchObject({ flagged: false, via: 'none' });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('thresholds and logging', () => {
  it('flags trade advice at the threshold and not just under it', async () => {
    expect((await modelSaysTradeAdvice(gemini, 'text', { fetch: vi.fn(answer(TRADE_ADVICE_THRESHOLD)), log: vi.fn() })).flagged).toBe(true);
    expect((await modelSaysTradeAdvice(gemini, 'text', { fetch: vi.fn(answer(TRADE_ADVICE_THRESHOLD - 0.01)), log: vi.fn() })).flagged).toBe(false);
    expect((await modelSaysDipRequest(gemini, 'text', { fetch: vi.fn(answer(DIP_THRESHOLD - 0.01)), log: vi.fn() })).flagged).toBe(false);
  });

  it('caps the text sent for the trade-advice check too', async () => {
    const fetchFn = vi.fn(answer(0.1));
    await modelSaysTradeAdvice(gemini, 'b'.repeat(100_000), { fetch: fetchFn, log: vi.fn() });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { input: string };
    expect(body.input).toHaveLength(MAX_INPUT_CHARS);
  });

  it('puts only a log-safe message in the log: no input, no key', async () => {
    const log = vi.fn();
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'safety', message: 'private-input-text' } }), { status: 400 }));
    await modelSaysDipRequest({ provider: 'gemini', apiKey: 'secret-key', model: null }, 'private-input-text', { fetch: fetchFn, log });
    const message = String(log.mock.calls[0][0]);
    expect(message).not.toContain('private-input-text');
    expect(message).not.toContain('secret-key');
  });

  it('survives a logger that throws or rejects', async () => {
    const failing = vi.fn(async () => new Response('', { status: 500 }));
    for (const log of [() => { throw new Error('log down'); }, async () => { throw new Error('log down'); }]) {
      const r = await modelSaysDipRequest(gemini, 'x', { fetch: failing, log }).catch((e: unknown) => e);
      expect(r).toEqual({ flagged: false, probability: null, via: 'none' });
    }
  });

  it('asks the trade-advice question about the whole text, with the verdict key', async () => {
    const fetchFn = vi.fn(answer(0.2));
    await modelSaysTradeAdvice(gemini, 'Margins fell two points.', { fetch: fetchFn, log: vi.fn() });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { input: string; questions: Record<string, { type: string; instructions: string }> };
    expect(body.input).toBe('Margins fell two points.');
    expect(Object.keys(body.questions)).toEqual(['verdict']);
    expect(body.questions.verdict.type).toBe('noul');
    expect(body.questions.verdict.instructions).toMatch(/buy, sell, hold/i);
  });
});

describe('tradeAdviceCheck', () => {
  it('is a plain predicate over the verdict', async () => {
    expect(await tradeAdviceCheck(gemini, { fetch: vi.fn(answer(0.95)), log: vi.fn() })('Pick up more shares.')).toBe(true);
    expect(await tradeAdviceCheck(gemini, { fetch: vi.fn(answer(0.05)), log: vi.fn() })('Margins fell.')).toBe(false);
    expect(await tradeAdviceCheck(null)('anything')).toBe(false);
  });
});

