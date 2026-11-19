import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverlayRun } from '@/lib/chart/overlayRuns';

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
  candles: [] as unknown[],
  candleCalls: [] as unknown[][],
  modelText: '',
  system: '',
  prompt: '',
  saveFails: false,
  runs: [] as (OverlayRun & { userId: string })[],
};

const withoutUser = (r: OverlayRun & { userId: string }): OverlayRun =>
  Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'userId')) as unknown as OverlayRun;

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: async () => state.aiConfig }));
vi.mock('@/lib/ai/promptModeStore', () => ({ resolvePromptMode: async () => state.mode }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({ getPrices: async () => state.prices }));
vi.mock('@/lib/dashboard/yahooCandles', () => ({
  getCandles: async (...a: unknown[]) => {
    state.candleCalls.push(a);
    return state.candles;
  },
}));
vi.mock('@/lib/ai/generate', () => ({
  generateInsightText: async (_c: unknown, system: string, prompt: string) => {
    state.system = system;
    state.prompt = prompt;
    return { ok: true, text: state.modelText, model: 'm', finishReason: 'stop' };
  },
}));
const logEvent = vi.fn(async () => undefined);
vi.mock('@/lib/system/eventLog', () => ({ logEvent }));
vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/chart/overlayRunsStore', () => ({
  listRuns: async (userId: string, symbol: string, interval: string) =>
    state.runs
      .filter((r) => r.userId === userId && r.symbol === symbol && r.interval === interval)
      .map((r) => withoutUser(r)),
  saveRun: async (input: { userId: string } & Omit<OverlayRun, 'id' | 'createdAt'>) => {
    if (state.saveFails) throw new Error('db down');
    const run = {
      ...input,
      id: `run${state.runs.length + 1}`,
      createdAt: '2026-11-19T05:30:00.000Z',
    };
    state.runs.unshift(run);
    return withoutUser(run);
  },
  deleteRun: async (userId: string, id: string) => {
    const i = state.runs.findIndex((r) => r.id === id && r.userId === userId);
    if (i < 0) return false;
    state.runs.splice(i, 1);
    return true;
  },
}));

const { GET, POST } = await import('./route');
const { DELETE } = await import('./[id]/route');
const post = (body: unknown = { symbol: 'acc' }) =>
  POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
const get = (qs = 'symbol=acc&interval=1d') =>
  GET(new Request(`http://x/api/insights/chart-overlay?${qs}`));
const del = (id: string) =>
  DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id }) });

const reply = JSON.stringify({
  levels: [
    { type: 'support', price: 150 },
    { type: 'resistance', price: 175 },
  ],
  bias: 'long',
  setup: { direction: 'long', entry: 1, stop: 2, target: 3 },
});

beforeEach(() => {
  state.userId = 'u1';
  state.aiConfig = {};
  state.mode = 'guarded';
  state.prices = bars;
  state.candles = [];
  state.candleCalls = [];
  state.modelText = reply;
  state.saveFails = false;
  state.runs = [];
  logEvent.mockClear();
});

describe('POST /api/insights/chart-overlay (generate and save)', () => {
  it('401s signed out, 422s a bad body or interval, 400s without an AI key and 502s without enough history', async () => {
    state.userId = null;
    expect((await post()).status).toBe(401);
    state.userId = 'u1';
    expect((await post({})).status).toBe(422);
    expect((await post({ symbol: 'ACC', interval: '2m' })).status).toBe(422);
    state.aiConfig = null;
    const res = await post();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
    state.aiConfig = {};
    state.prices = bars.slice(0, 5);
    expect((await post()).status).toBe(502);
  });

  it('saves every generation as a run of its own, so earlier ones are kept', async () => {
    await post();
    await post();
    expect(state.runs).toHaveLength(2);
    const body = await (await get()).json();
    expect(body.data.runs).toHaveLength(2);
  });

  it('guarded: saves and returns no trade setup, even though the model emitted one', async () => {
    const body = await (await post()).json();
    expect(body.data.run.mode).toBe('guarded');
    expect(body.data.run.overlay.levels).toHaveLength(2);
    expect(body.data.run.overlay.setup).toBeUndefined();
  });

  it('ignores a mode claimed in the request body', async () => {
    const body = await (await post({ symbol: 'ACC', mode: 'unrestricted' })).json();
    expect(body.data.run.overlay.setup).toBeUndefined();
  });

  it('unrestricted: plans the setup from the levels, not from the model prices', async () => {
    state.mode = 'unrestricted';
    const body = await (await post()).json();
    expect(body.data.run.overlay.setup).toMatchObject({
      direction: 'long',
      entryType: 'pullback',
      target: 175,
    });
    expect(body.data.run.overlay.setup.entry).toBeGreaterThan(150);
    expect(body.data.run.lastClose).toBe(159);
  });

  it("intraday: reads that timeframe's candles and tells the model which timeframe it is", async () => {
    const start = Date.UTC(2026, 10, 18, 3, 45) / 1000 + 19_800;
    state.candles = Array.from({ length: 60 }, (_, i) => {
      const close = 100 + i;
      return {
        time: String(start + i * 300),
        open: close,
        high: close + 0.2,
        low: close - 0.2,
        close,
        volume: 10,
      };
    });
    const res = await post({ symbol: 'acc', interval: '5m' });
    expect(res.status).toBe(200);
    expect(state.candleCalls[0]).toEqual(['ACC', '5m']);
    expect(state.prompt).toContain('5m candles, times in IST');
    expect(state.runs[0].interval).toBe('5m');
  });

  it('502s and logs when the model reply is unusable, and saves nothing', async () => {
    state.modelText = 'sorry, no';
    expect((await post()).status).toBe(502);
    expect(logEvent).toHaveBeenCalled();
    expect(state.runs).toHaveLength(0);
  });

  it('still shows the chart once when it could not be saved, and says it was not saved', async () => {
    state.saveFails = true;
    const body = await (await post()).json();
    expect(body.success).toBe(true);
    expect(body.data.saved).toBe(false);
    expect(body.data.run.overlay.levels).toHaveLength(2);
  });
});

describe('GET /api/insights/chart-overlay (saved runs)', () => {
  const saved = (over: Partial<OverlayRun & { userId: string }> = {}) => ({
    id: 'r1',
    userId: 'u1',
    symbol: 'ACC',
    interval: '1d' as const,
    mode: 'unrestricted' as const,
    overlay: {
      levels: [{ kind: 'support' as const, price: 150, label: 'S1' }],
      trendlines: [],
      indicators: [],
      setup: {
        direction: 'long' as const,
        entry: 152,
        stop: 149,
        target: 170,
        riskReward: 6,
        stopPct: -2,
        targetPct: 11.8,
        entryType: 'pullback' as const,
        lastClose: 160,
      },
    },
    model: 'm',
    lastClose: 160,
    createdAt: '2026-11-17T05:30:00.000Z',
    ...over,
  });

  it('401s signed out and 422s a bad symbol or interval', async () => {
    state.userId = null;
    expect((await get()).status).toBe(401);
    state.userId = 'u1';
    expect((await get('symbol=bad ticker!&interval=1d')).status).toBe(422);
    expect((await get('symbol=ACC&interval=2m')).status).toBe(422);
  });

  it("lists only the caller's own runs for that stock and timeframe", async () => {
    state.runs = [
      saved({ id: 'mine' }),
      saved({ id: 'theirs', userId: 'u2' }),
      saved({ id: 'other-tf', interval: '5m' }),
    ];
    const body = await (await get()).json();
    expect(body.data.runs.map((r: OverlayRun) => r.id)).toEqual(['mine']);
  });

  it('returns an old trade setup only while the caller is in unrestricted mode now', async () => {
    state.runs = [saved()];
    state.mode = 'unrestricted';
    expect((await (await get()).json()).data.runs[0].overlay.setup).toBeDefined();
    state.mode = 'guarded';
    expect((await (await get()).json()).data.runs[0].overlay.setup).toBeUndefined();
  });
});

describe('DELETE /api/insights/chart-overlay/[id]', () => {
  it("401s signed out, deletes your own run, and 404s a missing run or someone else's", async () => {
    state.runs = [
      {
        id: 'mine',
        userId: 'u1',
        symbol: 'ACC',
        interval: '1d',
        mode: 'guarded',
        overlay: { levels: [], trendlines: [], indicators: [] },
        model: 'm',
        lastClose: 1,
        createdAt: '2026-11-17T05:30:00.000Z',
      },
      {
        id: 'theirs',
        userId: 'u2',
        symbol: 'ACC',
        interval: '1d',
        mode: 'guarded',
        overlay: { levels: [], trendlines: [], indicators: [] },
        model: 'm',
        lastClose: 1,
        createdAt: '2026-11-17T05:30:00.000Z',
      },
    ];
    state.userId = null;
    expect((await del('mine')).status).toBe(401);
    state.userId = 'u1';
    expect((await del('theirs')).status).toBe(404);
    expect((await del('nope')).status).toBe(404);
    expect((await del('mine')).status).toBe(200);
    expect(state.runs.map((r) => r.id)).toEqual(['theirs']);
  });
});
