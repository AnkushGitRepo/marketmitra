import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { hosted: false };
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => 'u1' }));
vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));
const updatePreferences = vi.fn(async (_u: string, patch: unknown) => patch);
vi.mock('@/lib/preferences/store', () => ({ getPreferences: vi.fn(), updatePreferences }));

const { PATCH } = await import('./route');
const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }));

beforeEach(() => {
  state.hosted = false;
  vi.clearAllMocks();
});

describe('PATCH /api/settings/preferences - unrestricted Mitra', () => {
  it('allows turning it on locally', async () => {
    expect((await patch({ chat: { unrestricted: true } })).status).toBe(200);
    expect(updatePreferences).toHaveBeenCalled();
  });
  it('refuses turning it on on the hosted site, and stores nothing', async () => {
    state.hosted = true;
    const res = await patch({ chat: { unrestricted: true } });
    expect(res.status).toBe(403);
    expect(updatePreferences).not.toHaveBeenCalled();
  });
  it('still lets the hosted site turn it off and change other settings', async () => {
    state.hosted = true;
    expect((await patch({ chat: { unrestricted: false } })).status).toBe(200);
    expect((await patch({ chat: { sendOnEnter: false } })).status).toBe(200);
  });
});
