import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { userId: 'u1' as string | null, aiConfig: {} as object | null, ipos: [] as Array<Record<string, unknown>>, generated: 0, mode: 'guarded', reply: [{ key: 'listing', tone: 'neutral', text: 'ok' }] as Array<Record<string, string>>, cacheArgs: null as null | { key: string; userId: string | null; inputHash: string }, system: '', grounded: false };
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getAiConfig: async () => state.aiConfig }));
vi.mock('@/lib/dashboard/iposApi', () => ({ getIpos: async () => state.ipos }));
vi.mock('@/lib/rag/insightContext', () => ({ retrieveInsightGrounding: async () => ({ passages: [] }) }));
vi.mock('@/lib/ai/promptModeStore', () => ({ resolvePromptMode: async () => state.mode }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: async () => undefined }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/ai/structuredGenerate', () => ({
  generateStructuredBrief: async (req: { system: string; grounded?: boolean }) => {
    state.generated += 1;
    state.system = req.system;
    state.grounded = req.grounded === true;
    return { content: JSON.stringify({ items: state.reply }), model: 'm' };
  },
}));
vi.mock('@/lib/insights', () => ({
  hashInput: (v: unknown) => JSON.stringify(v),
  getOrGenerate: async (a: { key: string; userId: string | null; inputHash: string; generate: () => Promise<{ content?: string; model?: string; error?: string }> }) => {
    state.cacheArgs = { key: a.key, userId: a.userId, inputHash: a.inputHash };
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
  state.mode = 'guarded';
  state.reply = [{ key: 'listing', tone: 'neutral', text: 'ok' }];
  state.cacheArgs = null;
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
  it('researches with search grounding and caches a guarded brief in the shared entry', async () => {
    await call('a-ipo');
    expect(state.grounded).toBe(true);
    expect(state.cacheArgs).toMatchObject({ key: 'a-ipo', userId: null });
    expect(state.system).not.toMatch(/listingcall/);
  });
  it('drops verdict items a model wrote in guarded mode', async () => {
    state.reply = [{ key: 'listing', tone: 'neutral', text: 'ok' }, { key: 'listingcall', tone: 'positive', text: 'Apply' }, { key: 'longterm', tone: 'positive', text: 'Hold' }];
    const keys = JSON.parse((await (await call('a-ipo')).json()).data.content).items.map((i: { key: string }) => i.key);
    expect(keys).toEqual(['listing']);
  });
  it('keeps the verdict items for an unrestricted user and caches them per user, apart from the shared brief', async () => {
    state.mode = 'unrestricted';
    state.reply = [{ key: 'listing', tone: 'neutral', text: 'ok' }, { key: 'listingcall', tone: 'positive', text: 'Apply' }, { key: 'longterm', tone: 'neutral', text: 'Unclear' }];
    const keys = JSON.parse((await (await call('a-ipo')).json()).data.content).items.map((i: { key: string }) => i.key);
    expect(keys).toEqual(['listing', 'listingcall', 'longterm']);
    expect(state.cacheArgs).toMatchObject({ key: 'a-ipo:unrestricted', userId: 'u1' });
    expect(state.system).toMatch(/listingcall/);
    expect(state.system).not.toMatch(/never tell the reader what to buy/i);
  });
});
