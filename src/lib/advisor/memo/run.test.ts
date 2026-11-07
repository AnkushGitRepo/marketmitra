import { describe, expect, it, vi } from 'vitest';
import { extractJson, generateMemo, type GenerateFn } from './run';
import type { SourceRef } from './types';

const sources: SourceRef[] = [
  { id: 'AR1-01', label: 'AR', kind: 'passage', text: 'Our switching costs and long client relationships form the core of our moat.' },
];
const c = (t: string) => ({ text: t, citations: [{ sourceId: 'AR1-01', quote: 'switching costs and long client relationships' }], notFound: false });
const nf = { text: 'Topic: not found in provided material', citations: [], notFound: true };
const k = (m: string, th: number) => ({ description: `${m} breach`, metric: m, operator: '<', threshold: th, consecutivePeriods: 2, periodUnit: 'year', rationale: c('Moat depends on it.') });
const goodMemo = { business: [c('Sells services.')], moat: { assessment: c('Switching costs.'), erosionRisks: [nf] }, management: [nf], capitalAllocation: [nf], risks: [c('Concentration.'), nf], thesis: c('Sticky clients. Durable returns.'), killCriteria: [k('roce_pct', 12), k('debt_to_equity', 1)] };
const base = { symbol: 'X', name: 'X Ltd', sector: null, sources };

describe('extractJson', () => {
  it('handles code fences and prose', () => {
    expect(extractJson('Here: ```json\n{"a":1}\n``` done')).toEqual({ a: 1 });
    expect(extractJson('no json')).toBeNull();
    expect(extractJson('{broken')).toBeNull();
  });
});

describe('generateMemo', () => {
  it('accepts a grounded memo on the first attempt', async () => {
    const generate = vi.fn<GenerateFn>(async () => ({ ok: true, text: JSON.stringify(goodMemo), model: 'm' }));
    const r = await generateMemo({ ...base, generate });
    expect(r.ok && r.attempts).toBe(1);
  });

  it('repairs after feedback, feeding the issues back', async () => {
    const bad = { ...goodMemo, business: [{ text: 'Great company.', citations: [], notFound: false }] };
    const generate = vi
      .fn<GenerateFn>()
      .mockResolvedValueOnce({ ok: true, text: JSON.stringify(bad), model: 'm' })
      .mockResolvedValueOnce({ ok: true, text: JSON.stringify(goodMemo), model: 'm' });
    const r = await generateMemo({ ...base, generate });
    expect(r.ok && r.attempts).toBe(2);
    expect(generate.mock.calls[1][1]).toMatch(/Uncited claim/);
  });

  it('rejects after two failed attempts and never returns a memo', async () => {
    const bad = { ...goodMemo, business: [{ text: 'Great company.', citations: [], notFound: false }] };
    const generate = vi.fn<GenerateFn>(async () => ({ ok: true, text: JSON.stringify(bad), model: 'm' }));
    const r = await generateMemo({ ...base, generate });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('rejected');
      expect(r.issues.length).toBeGreaterThan(0);
      expect(generate).toHaveBeenCalledTimes(2);
    }
  });

  it('surfaces provider errors without retrying', async () => {
    const generate = vi.fn<GenerateFn>(async () => ({ ok: false, error: 'bad key' }));
    const r = await generateMemo({ ...base, generate });
    expect(!r.ok && r.reason).toBe('generation_failed');
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
