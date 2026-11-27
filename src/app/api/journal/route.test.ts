import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn(async (): Promise<string | null> => 'u1');
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
const listSnapshots = vi.fn(async () => []);
const setPostMortem = vi.fn(async (): Promise<object | null> => ({ id: 'j1' }));
vi.mock('@/lib/tradeJournal/store', () => ({ listSnapshots, setPostMortem }));

const { GET } = await import('./route');
const { PATCH } = await import('./[id]/route');

const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'j1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('/api/journal', () => {
  it('requires sign-in', async () => {
    getCurrentUserId.mockResolvedValue(null);
    expect((await GET(new Request('http://x/api/journal'))).status).toBe(401);
    expect((await patch({ postMortem: 'x' })).status).toBe(401);
  });
  it('narrows by symbol', async () => {
    await GET(new Request('http://x/api/journal?symbol=TCS'));
    expect(listSnapshots).toHaveBeenCalledWith('u1', 'TCS');
  });
  it('accepts a reflection or null, rejects other shapes and oversize text', async () => {
    expect((await patch({ postMortem: 'I sold too early' })).status).toBe(200);
    expect((await patch({ postMortem: null })).status).toBe(200);
    expect((await patch({ postMortem: 5 })).status).toBe(422);
    expect((await patch({ postMortem: 'x'.repeat(2001) })).status).toBe(422);
  });
  it('answers 404 for an entry that is not the user’s', async () => {
    setPostMortem.mockResolvedValueOnce(null);
    expect((await patch({ postMortem: 'x' })).status).toBe(404);
  });
});
