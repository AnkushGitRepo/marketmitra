import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  hosted: true,
  scopes: [] as Array<string | undefined>,
  holdings: [] as Array<{ userId: string; symbol: string }>,
  pending: [] as Array<Record<string, unknown>>,
  due: [] as Array<Record<string, unknown>>,
  auto: {} as Record<string, boolean>,
  initiated: [] as string[],
  checked: [] as string[],
  spawned: [] as string[],
};

vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));
vi.mock('@/lib/analysts/deps', () => ({ realDeps: () => ({ now: () => new Date('2026-11-11T11:00:00Z') }) }));
vi.mock('@/lib/analysts/engine', () => ({
  initiate: async (a: { symbol: string }) => (state.initiated.push(a.symbol), 'initiated'),
  heartbeat: async (a: { symbol: string }) => (state.checked.push(a.symbol), 'quiet'),
}));
vi.mock('@/lib/analysts/store', () => ({
  ensureAnalystIndexes: async () => undefined,
  listHoldingPairs: async (_n: number, only?: string) => (state.scopes.push(only), state.holdings.filter((h) => !only || h.userId === only)),
  spawnAnalyst: async (u: string, s: string) => (state.spawned.push(`${u}:${s}`), null),
  listInitializing: async (_n: number, only?: string) => (state.scopes.push(only), state.pending.filter((a) => !only || a.userId === only)),
  listDueForHeartbeat: async (_n: Date, _l: number, only?: string) => (state.scopes.push(only), state.due.filter((a) => !only || a.userId === only)),
  setStatus: async () => true,
}));
vi.mock('@/lib/preferences/store', () => ({ getPreferences: async (u: string) => ({ agents: { auto: state.auto[u] ?? true } }) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: async () => undefined }));

const { POST } = await import('./route');
const call = (auth?: string) => POST(new Request('http://x', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.CRON_SECRET = 'topsecret';
  state.hosted = true;
  state.scopes = [];
  state.holdings = [];
  state.pending = [];
  state.due = [];
  state.auto = {};
  state.initiated = [];
  state.checked = [];
  state.spawned = [];
});

describe('POST /api/cron/stock-analysts', () => {
  it('rejects a missing or wrong secret, and does nothing', async () => {
    state.pending = [{ userId: 'u1', symbol: 'ACC' }];
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect(state.initiated).toEqual([]);
  });
  it('gives every holding of an opted-in user an analyst, and skips users who turned automatic analysts off', async () => {
    state.holdings = [{ userId: 'u1', symbol: 'ACC' }, { userId: 'u2', symbol: 'TCS' }];
    state.auto = { u2: false };
    await call('Bearer topsecret');
    expect(state.spawned).toEqual(['u1:ACC']);
  });
  it('on a non-hosted deployment only ever touches the local user, even if the database holds other users', async () => {
    state.hosted = false;
    state.holdings = [{ userId: 'local', symbol: 'ACC' }, { userId: 'user_real', symbol: 'ACC' }];
    state.pending = [{ userId: 'user_real', symbol: 'TCS' }, { userId: 'local', symbol: 'INFY' }];
    state.due = [{ userId: 'user_real', symbol: 'SBIN' }];
    await call('Bearer topsecret');
    expect(state.spawned).toEqual(['local:ACC']);
    expect(state.initiated).toEqual(['INFY']);
    expect(state.checked).toEqual([]);
    expect(new Set(state.scopes)).toEqual(new Set(['local']));
  });
  it('on the hosted deployment serves every user', async () => {
    state.holdings = [{ userId: 'u1', symbol: 'ACC' }, { userId: 'u2', symbol: 'TCS' }];
    await call('Bearer topsecret');
    expect(state.spawned).toEqual(['u1:ACC', 'u2:TCS']);
    expect(new Set(state.scopes)).toEqual(new Set([undefined]));
  });
  it('builds pending dossiers and runs due checks, but never for a user who opted out', async () => {
    state.pending = [{ userId: 'u1', symbol: 'ACC' }, { userId: 'u2', symbol: 'TCS' }];
    state.due = [{ userId: 'u1', symbol: 'INFY' }, { userId: 'u2', symbol: 'SBIN' }];
    state.auto = { u2: false };
    const body = await (await call('Bearer topsecret')).json();
    expect(state.initiated).toEqual(['ACC']);
    expect(state.checked).toEqual(['INFY']);
    expect(body.data).toMatchObject({ initiated: 1, checked: 1, quiet: 1, skippedOff: 2, errors: [] });
  });
});
