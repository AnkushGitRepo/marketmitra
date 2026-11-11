import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  userId: 'u1' as string | null,
  aiConfig: {} as object | null,
  mode: 'guarded' as 'guarded' | 'unrestricted',
  bundle: { context: { symbol: 'ACC', company: { name: 'ACC', sector: null, industry: null, about: null }, latestClose: 1, news: [] }, signals: { sig: 1 } } as unknown,
  modelText: '',
  ttl: 0,
};

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: async () => state.aiConfig }));
vi.mock('@/lib/ai/promptModeStore', () => ({ resolvePromptMode: async () => state.mode }));
vi.mock('@/lib/ai/stockSignalsServer', () => ({ loadSignalBundle: async () => state.bundle }));
vi.mock('@/lib/ai/stockBrief', async (orig) => ({ ...(await orig<typeof import('@/lib/ai/stockBrief')>()), buildBriefPrompt: () => 'prompt' }));
vi.mock('@/lib/ai/generate', () => ({ generateInsightText: async () => ({ ok: true, text: state.modelText, model: 'm' }) }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/insights', () => ({
  hashInput: () => 'h',
  getOrGenerate: async (a: { generate: () => Promise<{ content?: string; model?: string; error?: string }>; ttlMs: number }) => {
    state.ttl = a.ttlMs;
    const g = await a.generate();
    if (g.error) return { ok: false, error: g.error };
    return { ok: true, cached: false, insight: { content: g.content, model: g.model, generatedAt: new Date('2026-11-11T00:00:00Z') } };
  },
}));

const { POST } = await import('./route');
const call = (body: unknown = { symbol: 'acc' }) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
const model = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ points: [{ key: 'quality', signal: 'strength', text: 'ROCE of 14.8%.' }], ...extra });

beforeEach(() => {
  state.userId = 'u1';
  state.aiConfig = {};
  state.mode = 'guarded';
  state.modelText = model();
});

describe('POST /api/insights/stock-brief', () => {
  it('401s signed out, 422s a bad body and 400s without an AI key (no model call is made)', async () => {
    state.userId = null;
    expect((await call()).status).toBe(401);
    state.userId = 'u1';
    expect((await call({})).status).toBe(422);
    state.aiConfig = null;
    const res = await call();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
  });

  it('returns the parsed points and caches for 12 hours', async () => {
    const res = await call();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.brief.points[0]).toMatchObject({ key: 'quality', signal: 'strength' });
    expect(body.data.mode).toBe('guarded');
    expect(state.ttl).toBe(12 * 60 * 60 * 1000);
  });

  it('strips a verdict the model produced when guarded', async () => {
    state.modelText = model({ valuation: 'undervalued', entry: 'Buy now.' });
    const body = await (await call()).json();
    expect(body.data.brief.valuation).toBeUndefined();
    expect(body.data.brief.entry).toBeUndefined();
  });

  it('keeps the verdict only in unrestricted mode', async () => {
    state.mode = 'unrestricted';
    state.modelText = model({ valuation: 'undervalued', entry: 'Looks reasonable.' });
    const body = await (await call()).json();
    expect(body.data.mode).toBe('unrestricted');
    expect(body.data.brief).toMatchObject({ valuation: 'undervalued', entry: 'Looks reasonable.' });
  });

  it('502s when the model answer cannot be read, and when the company cannot be loaded', async () => {
    state.modelText = 'sorry, no';
    expect((await call()).status).toBe(502);
    state.bundle = null;
    expect((await call()).status).toBe(502);
  });
});
