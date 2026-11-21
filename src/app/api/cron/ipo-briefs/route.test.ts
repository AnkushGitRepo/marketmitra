import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { aiConfig: { provider: 'gemini' } as object | null, hosted: true, configUser: undefined as unknown, generated: [] as string[], ipos: [] as Array<Record<string, unknown>> };
vi.mock('@/lib/ai/userAiConfig', () => ({ getAiConfig: async (u: unknown) => ((state.configUser = u), state.aiConfig) }));
vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));
vi.mock('@/lib/dashboard/iposApi', () => ({ getIpos: async () => state.ipos }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: async () => undefined }));
vi.mock('@/lib/ai/ipoBrief', () => ({
  getOrGenerateIpoBrief: async (a: { ipo: { slug: string }; mode: string; userId: string | null }) => {
    state.generated.push(`${a.ipo.slug}:${a.mode}:${a.userId}`);
    return { ok: true, cached: false, insight: {} };
  },
}));

const { POST } = await import('./route');
const call = (auth?: string) => POST(new Request('http://x', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  process.env.CRON_SECRET = 'shh';
  state.aiConfig = { provider: 'gemini' };
  state.hosted = true;
  state.configUser = undefined;
  state.generated = [];
  state.ipos = [{ slug: 'a', status: 'open', price: 1, ipo_size_cr: 1 }, { slug: 'b', status: 'closed', price: 1, ipo_size_cr: 1 }];
});

describe('POST /api/cron/ipo-briefs', () => {
  it('refuses a missing or wrong secret without spending the key', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer nope')).status).toBe(401);
    expect(state.generated).toEqual([]);
  });
  it('writes the shared guarded brief for open IPOs only', async () => {
    const res = await call('Bearer shh');
    expect(res.status).toBe(200);
    expect(state.generated).toEqual(['a:guarded:null']);
    expect((await res.json()).data).toMatchObject({ generated: 1 });
    expect(state.configUser).toBeNull(); // hosted: the deployment key, no user
  });
  it('uses the local user\'s key on a self-host', async () => {
    state.hosted = false;
    await call('Bearer shh');
    expect(state.configUser).toBe('local');
  });
  it('does nothing, and says so, with no AI key', async () => {
    state.aiConfig = null;
    const res = await call('Bearer shh');
    expect((await res.json()).data.skipped).toMatch(/no deployment ai key/i);
    expect(state.generated).toEqual([]);
  });
});
