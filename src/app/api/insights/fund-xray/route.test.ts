import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  userId: 'u1' as string | null,
  aiConfig: {} as object | null,
  load: { ok: true, fund: { base_name: 'X Fund' }, facts: { items: [{ key: 'role', tone: 'neutral', text: 't' }] } } as unknown,
  generated: { content: '{"items":[]}', model: 'm' } as { content?: string; model?: string; error?: string },
  seen: {} as Record<string, unknown>,
};

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: async () => state.aiConfig }));
vi.mock('@/lib/funds/xrayServer', () => ({ loadXray: async () => state.load, xrayInputHash: () => 'hash-1' }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/ai/structuredGenerate', () => ({
  generateStructuredBrief: async (req: { system: string; prompt: string }) => {
    state.seen.system = req.system;
    state.seen.prompt = req.prompt;
    return state.generated;
  },
}));
vi.mock('@/lib/insights', () => ({
  hashInput: (v: unknown) => JSON.stringify(v),
  getOrGenerate: async (a: { scope: string; key: string; userId: string | null; ttlMs: number; generate: () => Promise<{ content?: string; model?: string; error?: string }> }) => {
    state.seen.scope = a.scope;
    state.seen.key = a.key;
    state.seen.userId = a.userId;
    state.seen.ttl = a.ttlMs;
    const g = await a.generate();
    if (g.error) return { ok: false, error: g.error };
    return { ok: true, cached: false, insight: { content: g.content, model: g.model, generatedAt: new Date('2026-11-20T00:00:00Z') } };
  },
}));

const { POST } = await import('./route');
const call = (body: unknown = { code: 119783 }) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  state.userId = 'u1';
  state.aiConfig = {};
  state.load = { ok: true, fund: { base_name: 'X Fund' }, facts: { items: [{ key: 'role', tone: 'neutral', text: 't' }] } };
  state.generated = { content: '{"items":[]}', model: 'm' };
  state.seen = {};
});

describe('POST /api/insights/fund-xray', () => {
  it('401s signed out', async () => {
    state.userId = null;
    expect((await call()).status).toBe(401);
  });

  it.each([{}, { code: 0 }, { code: 'abc' }, { code: 1.5 }, { code: 2147483648 }])('422s a bad body (%j)', async (body) => {
    expect((await call(body)).status).toBe(422);
  });

  it('400s without an AI key and makes no model call', async () => {
    state.aiConfig = null;
    const res = await call();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
    expect(state.seen.prompt).toBeUndefined();
  });

  it('404s an unknown fund and 503s when the data service is down', async () => {
    state.load = { ok: false, reason: 'not_found' };
    expect((await call()).status).toBe(404);
    state.load = { ok: false, reason: 'unavailable' };
    expect((await call()).status).toBe(503);
  });

  it('writes up the findings for this user and fund, cached for 12 hours, on the guarded prompt', async () => {
    const res = await call();
    expect(res.status).toBe(200);
    // The write-up is stamped with the hash of the findings it was made from.
    expect(JSON.parse((await res.json()).data.content)).toEqual({ items: [], inputHash: 'hash-1' });
    expect(state.seen).toMatchObject({ scope: 'fund_xray', key: '119783', userId: 'u1', ttl: 12 * 60 * 60 * 1000 });
    expect(state.seen.prompt).toContain('X Fund');
    expect(String(state.seen.system)).toContain('You do NOT give a buy / sell / hold recommendation');
  });

  it('502s with the reason when the model call fails', async () => {
    state.generated = { error: 'Mitra returned an answer the page could not read. Try again.' };
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain('could not read');
  });
});
