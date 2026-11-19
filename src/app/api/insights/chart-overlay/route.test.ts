import { beforeEach, describe, expect, it, vi } from 'vitest';

const bars = Array.from({ length: 60 }, (_, i) => ({
  trade_date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10),
  open: 99 + i,
  high: 102 + i,
  low: 98 + i,
  close: 100 + i,
  volume: 1000,
}));
const state = {
  userId: 'u1' as string | null,
  aiConfig: {} as object | null,
  mode: 'guarded' as 'guarded' | 'unrestricted',
  prices: bars as unknown[] | null,
  modelText: '',
  system: '',
  ttl: 0,
};

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: async () => state.aiConfig }));
vi.mock('@/lib/ai/promptModeStore', () => ({ resolvePromptMode: async () => state.mode }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({ getPrices: async () => state.prices }));
vi.mock('@/lib/ai/generate', () => ({
  generateInsightText: async (_c: unknown, system: string) => {
    state.system = system;
    return { ok: true, text: state.modelText, model: 'm', finishReason: 'stop' };
  },
}));
const logEvent = vi.fn(async () => undefined);
vi.mock('@/lib/system/eventLog', () => ({ logEvent }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/insights', () => ({
  hashInput: (v: unknown) => JSON.stringify(v),
  getOrGenerate: async (a: { generate: () => Promise<{ content?: string; model?: string; error?: string }>; ttlMs: number }) => {
    state.ttl = a.ttlMs;
    const g = await a.generate();
    if (g.error) return { ok: false, error: g.error };
    return { ok: true, cached: false, insight: { content: g.content, model: g.model, generatedAt: new Date('2026-11-19T00:00:00Z') } };
  },
}));

const { POST } = await import('./route');
const call = (body: unknown = { symbol: 'acc' }) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
const reply = JSON.stringify({
  levels: [{ type: 'support', price: 150 }],
  setup: { direction: 'long', entry: 159, stop: 150, target: 180 },
});

beforeEach(() => {
  state.userId = 'u1';
  state.aiConfig = {};
  state.mode = 'guarded';
  state.prices = bars;
  state.modelText = reply;
  state.system = '';
});

describe('POST /api/insights/chart-overlay', () => {
  it('401s signed out, 422s a bad body, 400s without an AI key and 502s without enough history', async () => {
    state.userId = null;
    expect((await call()).status).toBe(401);
    state.userId = 'u1';
    expect((await call({})).status).toBe(422);
    state.aiConfig = null;
    const res = await call();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
    state.aiConfig = {};
    state.prices = bars.slice(0, 5);
    expect((await call()).status).toBe(502);
  });

  it('guarded: strips the setup even though the model emitted one, and says so in the mode', async () => {
    const body = await (await call()).json();
    expect(body.data.mode).toBe('guarded');
    expect(body.data.overlay.levels).toHaveLength(1);
    expect(body.data.overlay.setup).toBeUndefined();
    expect(state.system).not.toContain('"setup"'.concat(':{'));
  });

  it('ignores a mode claimed in the request body', async () => {
    const body = await (await call({ symbol: 'ACC', mode: 'unrestricted' })).json();
    expect(body.data.mode).toBe('guarded');
    expect(body.data.overlay.setup).toBeUndefined();
  });

  it('unrestricted: returns a validated setup with code-computed risk/reward', async () => {
    state.mode = 'unrestricted';
    const body = await (await call()).json();
    expect(body.data.mode).toBe('unrestricted');
    expect(body.data.overlay.setup).toMatchObject({ direction: 'long', entry: 159, stop: 150, riskReward: 2.3 });
    expect(state.ttl).toBe(12 * 60 * 60 * 1000);
  });

  it('502s and logs when the model reply is unusable', async () => {
    state.modelText = 'sorry, no';
    const res = await call();
    expect(res.status).toBe(502);
    expect(logEvent).toHaveBeenCalled();
  });
});
