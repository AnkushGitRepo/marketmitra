import { describe, expect, it, vi } from 'vitest';
import { tradeAdviceCheck } from '@/lib/ai/decisions/screens';
import { generateMemo, type GenerateFn } from './run';
import type { SourceRef } from './types';

// generateMemo with the real decision-model predicate and only the network stubbed.

const sources: SourceRef[] = [{ id: 'AR1-01', label: 'AR', kind: 'passage', text: 'Our switching costs and long client relationships form the core of our moat.' }];
const c = (t: string) => ({ text: t, citations: [{ sourceId: 'AR1-01', quote: 'switching costs and long client relationships' }], notFound: false });
const nf = { text: 'Topic: not found in provided material', citations: [], notFound: true };
const k = (m: string, th: number) => ({ description: `${m} breach`, metric: m, operator: '<', threshold: th, consecutivePeriods: 2, periodUnit: 'year', rationale: c('Moat depends on it.') });
const memo = { business: [c('Sells services.')], moat: { assessment: c('Switching costs.'), erosionRisks: [nf] }, management: [nf], capitalAllocation: [nf], risks: [c('Concentration.'), nf], thesis: c('Sticky clients. Durable returns.'), killCriteria: [k('roce_pct', 12), k('debt_to_equity', 1)] };
const base = { symbol: 'X', name: 'X Ltd', sector: null, sources };
const gemini = { provider: 'gemini', apiKey: 'k', model: null } as const;
const verdict = (p: number) => async () => new Response(JSON.stringify({ answers: { verdict: { type: 'noul', noul: p, confidence: Math.max(p, 1 - p) } } }), { status: 200 });

describe('generateMemo with the Gemini decision check', () => {
  it('sends the memo wording to Google and accepts a memo it does not flag', async () => {
    const fetchFn = vi.fn(verdict(0.04));
    const generate = vi.fn<GenerateFn>(async () => ({ ok: true, text: JSON.stringify(memo), model: 'm' }));
    const r = await generateMemo({ ...base, generate, adviceCheck: tradeAdviceCheck(gemini, { fetch: fetchFn, log: vi.fn() }) });
    expect(r.ok && r.attempts).toBe(1);
    const input = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).input as string;
    expect(input).toContain('Sells services.');
    expect(input).toContain('Sticky clients. Durable returns.');
  });

  it('rejects a memo Google keeps flagging, after one repair attempt, and stores nothing', async () => {
    const generate = vi.fn<GenerateFn>(async () => ({ ok: true, text: JSON.stringify(memo), model: 'm' }));
    const r = await generateMemo({ ...base, generate, adviceCheck: tradeAdviceCheck(gemini, { fetch: vi.fn(verdict(0.99)), log: vi.fn() }) });
    expect(r.ok).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(!r.ok && r.issues[0].message).toMatch(/buy, sell or hold/i);
  });

  it('accepts the memo as the regex-only path would when Google is down', async () => {
    const generate = vi.fn<GenerateFn>(async () => ({ ok: true, text: JSON.stringify(memo), model: 'm' }));
    const r = await generateMemo({ ...base, generate, adviceCheck: tradeAdviceCheck(gemini, { fetch: vi.fn(async () => { throw new Error('down'); }), log: vi.fn() }) });
    expect(r.ok && r.attempts).toBe(1);
  });
});
