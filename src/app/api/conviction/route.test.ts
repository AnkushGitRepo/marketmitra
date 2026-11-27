import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn(async (): Promise<string | null> => 'u1');
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));

const entry = { id: 'e1', symbol: 'TCS', tag: 'high', waitFor: null, targetPrice: 3800, targetDirection: 'at_or_below', noteId: null };
const upsertEntry = vi.fn(async (): Promise<typeof entry | null> => entry);
const deleteEntry = vi.fn(async () => true);
vi.mock('@/lib/conviction/store', () => ({ listEntries: vi.fn(async () => [entry]), upsertEntry, deleteEntry }));

const { GET, PUT } = await import('./route');
const { DELETE } = await import('./[symbol]/route');

const put = (body: unknown) => PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }));
const del = (symbol: string) => DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ symbol }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('/api/conviction', () => {
  it('requires a signed-in user on every method', async () => {
    getCurrentUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await put({ symbol: 'TCS' })).status).toBe(401);
    expect((await del('TCS')).status).toBe(401);
  });

  it('lists entries in the standard envelope', async () => {
    const body = await (await GET()).json();
    expect(body).toEqual({ success: true, data: [entry], error: null });
  });

  it('rejects a bad target before touching the store', async () => {
    for (const bad of [{ symbol: 'TCS', targetPrice: 0 }, { symbol: 'TCS', targetPrice: -5 }, { symbol: '' }, { symbol: 'TCS', tag: 'high', waitFor: 'x' }]) {
      expect((await put(bad)).status).toBe(422);
    }
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  it('saves a valid entry with an upper-cased symbol', async () => {
    expect((await put({ symbol: ' tcs ', targetPrice: 3800 })).status).toBe(200);
    expect(upsertEntry).toHaveBeenCalledWith('u1', expect.objectContaining({ symbol: 'TCS', targetPrice: 3800 }));
  });

  it('answers 409 when the board is full', async () => {
    upsertEntry.mockResolvedValueOnce(null);
    expect((await put({ symbol: 'TCS' })).status).toBe(409);
  });

  it('answers 404 when there is nothing to remove', async () => {
    deleteEntry.mockResolvedValueOnce(false);
    expect((await del('NOPE')).status).toBe(404);
    expect((await del('TCS')).status).toBe(200);
  });
});
