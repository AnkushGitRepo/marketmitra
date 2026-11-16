import { describe, expect, it, vi } from 'vitest';
import { DECISIONS_URL, DECISION_MODEL, askYesNo } from './client';

const gemini = { provider: 'gemini', apiKey: 'test-key', model: null } as const;
const reply = (answers: Record<string, { noul: number; confidence: number }>) =>
  new Response(JSON.stringify({ answers: Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { type: 'noul', ...v }])), usage: { total_output_tokens: 0 } }), { status: 200 });

describe('askYesNo', () => {
  it('posts the shared input and questions with the key in the header and returns P(yes)', async () => {
    const fetchFn = vi.fn(async () => reply({ is_dip: { noul: 0.91, confidence: 0.91 } }));
    const r = await askYesNo(gemini, 'is this the bottom?', { is_dip: 'Is the user asking about buying after a fall?' }, { fetch: fetchFn });
    expect(r).toEqual({ ok: true, answers: { is_dip: { yes: 0.91, confidence: 0.91 } } });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DECISIONS_URL);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(init.body as string)).toEqual({
      model: DECISION_MODEL,
      input: 'is this the bottom?',
      questions: { is_dip: { type: 'noul', instructions: 'Is the user asking about buying after a fall?' } },
    });
  });

  it('is unavailable, without any request, for a provider other than Gemini', async () => {
    const fetchFn = vi.fn();
    const r = await askYesNo({ provider: 'anthropic', apiKey: 'k', model: null }, 'x', { q: 'Q?' }, { fetch: fetchFn });
    expect(r).toMatchObject({ ok: false, reason: 'unavailable' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await askYesNo(null, 'x', { q: 'Q?' }, { fetch: fetchFn })).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('rejects an invalid request before sending it', async () => {
    const fetchFn = vi.fn();
    for (const [input, qs] of [
      ['', { q: 'Q?' }],
      ['text', {}],
      ['text', { 'bad key!': 'Q?' }],
      ['text', { q: '' }],
    ] as const) {
      expect(await askYesNo(gemini, input, qs, { fetch: fetchFn })).toMatchObject({ ok: false, reason: 'rejected' });
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('reports an API 400 as rejected with its code but never its body, the key or the input', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'safety', message: 'blocked: secret-input-text test-key' } }), { status: 400 }));
    const r = await askYesNo(gemini, 'secret-input-text', { q: 'Q?' }, { fetch: fetchFn });
    expect(r).toMatchObject({ ok: false, reason: 'rejected' });
    const message = (r as { message: string }).message;
    expect(message).toContain('400');
    expect(message).toContain('safety');
    expect(message).not.toContain('secret-input-text');
    expect(message).not.toContain('test-key');
  });

  it('reports server errors, a malformed reply, a missing answer and a network failure as failed', async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => new Response('oops', { status: 503 }),
      async () => new Response('not json', { status: 200 }),
      async () => new Response(JSON.stringify({ answers: {} }), { status: 200 }),
      async () => new Response(JSON.stringify({ answers: { q: { type: 'noul', noul: 1.5, confidence: 0.9 } } }), { status: 200 }),
      async () => {
        throw new Error('network down');
      },
    ];
    for (const c of cases) {
      expect(await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: vi.fn(c) })).toMatchObject({ ok: false, reason: 'failed' });
    }
  });

  it('gives up after the timeout', async () => {
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    const r = await askYesNo(gemini, 'x', { q: 'Q?' }, { fetch: fetchFn as unknown as typeof fetch, timeoutMs: 20 });
    expect(r).toMatchObject({ ok: false, reason: 'failed' });
    expect((r as { message: string }).message).toMatch(/timed out/i);
  });
});
