import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { userId: 'u1' as string | null, hosted: true };
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/deployment-mode', () => ({ isHosted: () => state.hosted }));

vi.mock('@/lib/system/eventLog', () => ({ logEvent: vi.fn(async () => undefined) }));

class TokenLimitError extends Error {}
const createToken = vi.fn();
const listTokens = vi.fn();
const revokeToken = vi.fn();
vi.mock('@/lib/tokens/store', () => ({ TokenLimitError, createToken, listTokens, revokeToken }));

const { GET, POST } = await import('./route');
const { DELETE } = await import('./[id]/route');

const post = (body: unknown) => POST(new Request('http://x/api/settings/tokens', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  state.userId = 'u1';
  state.hosted = true;
  vi.clearAllMocks();
});

describe('GET /api/settings/tokens', () => {
  it('401s without a user', async () => {
    state.userId = null;
    expect((await GET()).status).toBe(401);
  });
  it('lists tokens when hosted, and never caches', async () => {
    listTokens.mockResolvedValue([{ id: 'a', name: 'cron' }]);
    const res = await GET();
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ success: true, data: { enabled: true, tokens: [{ id: 'a', name: 'cron' }] } });
  });
  it('reports disabled in self-host mode without touching the store', async () => {
    state.hosted = false;
    expect((await (await GET()).json()).data).toEqual({ enabled: false, tokens: [] });
    expect(listTokens).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings/tokens', () => {
  it('creates a token and returns the plaintext once with 201', async () => {
    createToken.mockResolvedValue({ token: 'mm_pat_r_x', view: { id: 'a', name: 'cron', scope: 'read' } });
    const res = await post({ name: 'cron', scope: 'read' });
    expect(res.status).toBe(201);
    expect((await res.json()).data).toMatchObject({ token: 'mm_pat_r_x', id: 'a' });
    expect(createToken).toHaveBeenCalledWith('u1', { name: 'cron', scope: 'read', expiry: '90d' });
  });
  it('422s on invalid input and 400s in self-host mode', async () => {
    expect((await post({ name: '', scope: 'read' })).status).toBe(422);
    state.hosted = false;
    expect((await post({ name: 'a', scope: 'read' })).status).toBe(400);
  });
  it('409s at the token cap and 401s when signed out', async () => {
    createToken.mockRejectedValue(new TokenLimitError('limit'));
    expect((await post({ name: 'a', scope: 'read' })).status).toBe(409);
    state.userId = null;
    expect((await post({ name: 'a', scope: 'read' })).status).toBe(401);
  });
});

describe('DELETE /api/settings/tokens/[id]', () => {
  const del = (id: string) => DELETE(new Request('http://x'), { params: Promise.resolve({ id }) });
  it('revokes, 404s when not found, 401s when signed out', async () => {
    revokeToken.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await del('a')).status).toBe(200);
    expect((await del('b')).status).toBe(404);
    state.userId = null;
    expect((await del('a')).status).toBe(401);
  });
});
