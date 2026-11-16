import { describe, expect, it, vi } from 'vitest';
import { DECISIONS_URL, DECISION_MODEL, askYesNo } from './client';

// Pinned to the quickstart in Google's Decisions API docs (https://aistudio.google.com/docs/decisions-api),
// so a change to the request or to how the reply is read is deliberate.

const gemini = { provider: 'gemini', apiKey: 'AIza-test', model: 'gemini-3.8-flash' } as const;

describe('Gemini Decisions API contract', () => {
  it('sends exactly the documented quickstart request', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ answers: { is_damaged: { type: 'noul', noul: 0.97, confidence: 0.97 } }, usage: { total_output_tokens: 0 } }), { status: 200 }));
    await askYesNo(gemini, 'The blue mug I ordered on Monday arrived cracked on Wednesday.', { is_damaged: 'Did the item arrive damaged?' }, { fetch: fetchFn });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(url).toBe(DECISIONS_URL);
    expect(init.headers).toEqual({ 'Content-Type': 'application/json', 'x-goog-api-key': 'AIza-test' });
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'gemini-decision-1',
      input: 'The blue mug I ordered on Monday arrived cracked on Wednesday.',
      questions: { is_damaged: { type: 'noul', instructions: 'Did the item arrive damaged?' } },
    });
    expect(DECISION_MODEL).toBe('gemini-decision-1');
  });

  it('never sends the user\'s chat model, and never puts the key in the URL or body', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ answers: { q: { type: 'noul', noul: 0.5, confidence: 0.5 } } }), { status: 200 }));
    await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: fetchFn });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('AIza-test');
    expect(init.body as string).not.toContain('AIza-test');
    expect(init.body as string).not.toContain('gemini-3.8-flash');
  });

  it('reads the documented answer, including the documented range of 0.01 to 0.99, and ignores extra fields', async () => {
    for (const p of [0.01, 0.5, 0.99]) {
      const fetchFn = vi.fn(async () => new Response(JSON.stringify({ answers: { q: { type: 'noul', noul: p, confidence: Math.max(p, 1 - p), extra: 'ignored' } }, usage: { input_tokens_by_modality: [{ modality: 'text', tokens: 12 }], total_output_tokens: 0 } }), { status: 200 }));
      expect(await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: fetchFn })).toEqual({ ok: true, answers: { q: { yes: p, confidence: Math.max(p, 1 - p) } } });
    }
  });

  it('refuses an answer of the wrong type for a yes/no question', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ answers: { q: { type: 'choice', choice: 'a', probabilities: { a: 1 }, confidence: 1 } } }), { status: 200 }));
    expect(await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: fetchFn })).toMatchObject({ ok: false, reason: 'failed' });
  });

  it('answers every question of a batch under the key it was asked with', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ answers: { a: { type: 'noul', noul: 0.2, confidence: 0.8 }, b: { type: 'noul', noul: 0.9, confidence: 0.9 } } }), { status: 200 }));
    const r = await askYesNo(gemini, 'x', { a: 'A?', b: 'B?' }, { fetch: fetchFn });
    expect(r).toEqual({ ok: true, answers: { a: { yes: 0.2, confidence: 0.8 }, b: { yes: 0.9, confidence: 0.9 } } });
  });

  it('accepts the documented limits: a 64-character key and 1,000 questions, and refuses 1,001', async () => {
    const answers = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, { type: 'noul', noul: 0.5, confidence: 0.5 }]));
    const ask = (n: number) => askYesNo(gemini, 'x', Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, 'Q?'])), { fetch: vi.fn(async () => new Response(JSON.stringify({ answers: answers(n) }), { status: 200 })) });
    expect((await ask(1000)).ok).toBe(true);
    expect(await ask(1001)).toMatchObject({ ok: false, reason: 'rejected' });
    const longKey = 'k'.repeat(64);
    expect((await askYesNo(gemini, 'x', { [longKey]: 'Q?' }, { fetch: vi.fn(async () => new Response(JSON.stringify({ answers: { [longKey]: { type: 'noul', noul: 0.5, confidence: 0.5 } } }), { status: 200 })) })).ok).toBe(true);
    expect(await askYesNo(gemini, 'x', { [`${longKey}k`]: 'Q?' }, { fetch: vi.fn() })).toMatchObject({ ok: false, reason: 'rejected' });
  });

  it('treats each documented safety error code as a refusal and nothing else', async () => {
    for (const code of ['safety', 'prohibited_content', 'blocklist', 'image_safety', 'content_blocked']) {
      const r = await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: vi.fn(async () => new Response(JSON.stringify({ error: { code, message: 'm' } }), { status: 400 })) });
      expect(r).toMatchObject({ ok: false, reason: 'rejected' });
      expect((r as { message: string }).message).toContain(code);
    }
    for (const status of [401, 403, 429, 500]) {
      expect(await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: vi.fn(async () => new Response('', { status })) })).toMatchObject({ ok: false, reason: 'failed' });
    }
  });

  it('is unavailable with an empty key', async () => {
    expect(await askYesNo({ provider: 'gemini', apiKey: '', model: null }, 'x', { q: 'Q?' }, { fetch: vi.fn() })).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});
