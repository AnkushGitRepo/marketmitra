import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  userId: 'u1' as string | null,
  load: { ok: true, fund: {}, facts: { items: [], theme: 'Healthcare', sectors: ['Healthcare'], portfolioPct: 0, peerCount: 3 } } as unknown,
  asked: [] as unknown[],
};

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/funds/xrayServer', () => ({
  loadXray: async (userId: string, code: number) => {
    state.asked.push([userId, code]);
    return state.load;
  },
}));

const { GET } = await import('./route');
const call = (code: string) => GET(new Request('http://x'), { params: Promise.resolve({ code }) });

beforeEach(() => {
  state.userId = 'u1';
  state.asked = [];
  state.load = { ok: true, fund: {}, facts: { items: [], theme: 'Healthcare', sectors: ['Healthcare'], portfolioPct: 0, peerCount: 3 } };
});

describe('GET /api/funds/[code]/xray', () => {
  it('401s signed out and loads nothing', async () => {
    state.userId = null;
    expect((await call('119783')).status).toBe(401);
    expect(state.asked).toEqual([]);
  });

  it.each(['abc', '0', '-3', '1.5', '2147483648'])('400s the code %j', async (code) => {
    expect((await call(code)).status).toBe(400);
  });

  it('returns the findings in the standard envelope, for this user and code', async () => {
    const res = await call('119783');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, data: { schemeCode: 119783, theme: 'Healthcare', portfolioPct: 0 } });
    expect(state.asked).toEqual([['u1', 119783]]);
  });

  it('404s an unknown fund and 503s when the data service is down', async () => {
    state.load = { ok: false, reason: 'not_found' };
    expect((await call('119783')).status).toBe(404);
    state.load = { ok: false, reason: 'unavailable' };
    expect((await call('119783')).status).toBe(503);
  });
});
