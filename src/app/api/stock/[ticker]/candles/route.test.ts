import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  hosted: true,
  bars: [{ time: '1', open: 1, high: 1, low: 1, close: 1, volume: 1 }] as unknown[],
  fail: false,
  calls: [] as unknown[][],
};

vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));
vi.mock('@/lib/dashboard/yahooCandles', () => ({
  getCandles: async (...args: unknown[]) => {
    state.calls.push(args);
    if (state.fail) throw new Error('boom');
    return state.bars;
  },
}));

const { GET } = await import('./route');
const call = (qs: string, ticker = 'acc') =>
  GET(new Request(`http://x/api/stock/${ticker}/candles?${qs}`), {
    params: Promise.resolve({ ticker }),
  });

beforeEach(() => {
  state.hosted = true;
  state.fail = false;
  state.calls = [];
});

describe('GET /api/stock/[ticker]/candles', () => {
  it('400s a bad ticker, interval or last without calling Yahoo', async () => {
    expect((await call('interval=1m', 'bad ticker!')).status).toBe(400);
    expect((await call('interval=2m')).status).toBe(400);
    expect((await call('interval=1m&last=0')).status).toBe(400);
    expect((await call('interval=1m&last=999')).status).toBe(400);
    expect((await call('interval=1m&last=abc')).status).toBe(400);
    expect(state.calls).toHaveLength(0);
  });

  it('returns the bars with the hosted poll cadence for the timeframe', async () => {
    const body = await (await call('interval=5m')).json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ symbol: 'ACC', interval: '5m', pollMs: 30_000 });
    expect(state.calls[0]).toEqual(['ACC', '5m', undefined]);
  });

  it('polls twice as fast on a local install and passes `last` through', async () => {
    state.hosted = false;
    const body = await (await call('interval=1m&last=3')).json();
    expect(body.data.pollMs).toBe(5_000);
    expect(state.calls[0]).toEqual(['ACC', '1m', 3]);
  });

  it('502s when Yahoo fails', async () => {
    state.fail = true;
    const res = await call('interval=1h');
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('candles_unavailable');
  });
});
