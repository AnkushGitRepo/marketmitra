import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { hosted: true, users: ['u1', 'u2', 'local'], auto: {} as Record<string, boolean>, scopes: [] as Array<string | undefined>, ran: [] as string[], result: 'sent' as 'sent' | 'nothing' | 'already' };

vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));
vi.mock('@/lib/analysts/dispatchStore', () => ({ ensureDispatchIndexes: async () => undefined }));
vi.mock('@/lib/analysts/store', () => ({ listUsersWithActiveAnalysts: async (only?: string) => (state.scopes.push(only), state.users.filter((u) => !only || u === only)) }));
vi.mock('@/lib/analysts/dispatchRun', () => ({ runDispatch: async (u: string) => (state.ran.push(u), { kind: state.result }) }));
vi.mock('@/lib/preferences/store', () => ({ getPreferences: async (u: string) => ({ agents: { auto: state.auto[u] ?? true } }) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: async () => undefined }));

const { POST } = await import('./route');
const call = (auth?: string) => POST(new Request('http://x', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.CRON_SECRET = 'topsecret';
  state.hosted = true;
  state.auto = {};
  state.scopes = [];
  state.ran = [];
  state.result = 'sent';
});

describe('POST /api/cron/analyst-dispatch', () => {
  it('requires the cron secret', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await call('Bearer x')).status).toBe(503);
    expect(state.ran).toHaveLength(0);
  });
  it('runs every user with a vigilant analyst when hosted, and skips users who turned automatic analysts off', async () => {
    state.auto = { u2: false };
    const body = (await (await call('Bearer topsecret')).json()) as { data: { users: number; sent: number; skippedOff: number } };
    expect(state.ran).toEqual(['u1', 'local']);
    expect(body.data).toMatchObject({ users: 3, sent: 2, skippedOff: 1 });
  });
  it('only ever touches the local user when not hosted', async () => {
    state.hosted = false;
    await call('Bearer topsecret');
    expect(state.scopes).toEqual(['local']);
    expect(state.ran).toEqual(['local']);
  });
  it('counts "nothing material" and "already sent" separately', async () => {
    state.result = 'nothing';
    expect(((await (await call('Bearer topsecret')).json()) as { data: { nothing: number } }).data.nothing).toBe(3);
    state.result = 'already';
    expect(((await (await call('Bearer topsecret')).json()) as { data: { already: number } }).data.already).toBe(3);
  });
});
