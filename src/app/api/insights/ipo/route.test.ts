import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { userId: 'u1' as string | null, aiConfig: {} as object | null, ipos: [] as Array<Record<string, unknown>>, generated: 0 };
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getAiConfig: async () => state.aiConfig }));
vi.mock('@/lib/dashboard/iposApi', () => ({ getIpos: async () => state.ipos }));
vi.mock('@/lib/rag/insightContext', () => ({ retrieveInsightGrounding: async () => ({ passages: [] }) }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/ai/structuredGenerate', () => ({
  generateStructuredBrief: async () => {
    state.generated += 1;
    return { content: JSON.stringify({ items: [{ key: 'listing', tone: 'neutral', text: 'ok' }] }), model: 'm' };
  },
}));
vi.mock('@/lib/insights', () => ({
  hashInput: () => 'h',
  getOrGenerate: async (a: { generate: () => Promise<{ content?: string; model?: string; error?: string }> }) => {
    const g = await a.generate();
    return g.error ? { ok: false, error: g.error } : { ok: true, cached: false, insight: { content: g.content, model: g.model, generatedAt: new Date() } };
  },
}));

const { POST } = await import('./route');
const call = (slug: string) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify({ slug }) }));
const ipo = (over: Record<string, unknown>) => ({ slug: 'a-ipo', name: 'A', category: 'mainboard', status: 'open', price: 100, ipo_size_cr: 50, lot_size: 10, gmp: 5, gmp_pct: 5, subscription_times: 2, open_date: null, close_date: null, listing_date: null, anchor: null, ...over });

beforeEach(() => {
  state.userId = 'u1';
  state.aiConfig = {};
  state.generated = 0;
  state.ipos = [ipo({}), ipo({ slug: 'sparse-ipo', price: null, ipo_size_cr: null, gmp: 282 })];
});

describe('POST /api/insights/ipo', () => {
  it('401s signed out, 400s without a key, 404s an unknown slug', async () => {
    state.userId = null;
    expect((await call('a-ipo')).status).toBe(401);
    state.userId = 'u1';
    state.aiConfig = null;
    expect((await call('a-ipo')).status).toBe(400);
    state.aiConfig = {};
    expect((await call('missing')).status).toBe(404);
  });
  it('refuses an IPO with neither a price nor a size, without calling the model', async () => {
    const res = await call('sparse-ipo');
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/not enough data/i);
    expect(state.generated).toBe(0);
  });
  it('returns the structured content for an IPO with data', async () => {
    const res = await call('a-ipo');
    expect(res.status).toBe(200);
    expect(JSON.parse((await res.json()).data.content).items[0].key).toBe('listing');
    expect(state.generated).toBe(1);
  });
});
