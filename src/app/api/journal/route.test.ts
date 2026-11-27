import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn(async (): Promise<string | null> => 'u1');
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
const listSnapshots = vi.fn(async () => []);
const editEntryText = vi.fn<(userId: string, id: string, edit: object) => Promise<object | null>>(async () => ({ id: 'j1' }));
const deleteSnapshot = vi.fn(async () => true);
const deleteAllSnapshots = vi.fn(async () => 3);
vi.mock('@/lib/tradeJournal/store', () => ({ listSnapshots, editEntryText, deleteSnapshot, deleteAllSnapshots }));

const { GET, DELETE: DELETE_ALL } = await import('./route');
const { PATCH, DELETE } = await import('./[id]/route');

const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'j1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

const del = () => DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'j1' }) });

describe('/api/journal', () => {
  it('requires sign-in', async () => {
    getCurrentUserId.mockResolvedValue(null);
    expect((await GET(new Request('http://x/api/journal'))).status).toBe(401);
    expect((await patch({ postMortem: 'x' })).status).toBe(401);
    expect((await del()).status).toBe(401);
    expect((await DELETE_ALL()).status).toBe(401);
    expect(deleteSnapshot).not.toHaveBeenCalled();
    expect(deleteAllSnapshots).not.toHaveBeenCalled();
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
  it('edits only the user’s own words: reason and reflection', async () => {
    expect((await patch({ reason: 'new reason' })).status).toBe(200);
    expect(editEntryText).toHaveBeenCalledWith('u1', 'j1', { reason: 'new reason' });
    for (const bad of [{}, { reason: 'x'.repeat(281) }, { marketPrice: 1 }, { pe: 5 }]) expect((await patch(bad)).status).toBe(422);
  });
  it('deletes one entry, or reports it missing', async () => {
    expect((await del()).status).toBe(200);
    expect(deleteSnapshot).toHaveBeenCalledWith('u1', 'j1');
    deleteSnapshot.mockResolvedValueOnce(false);
    expect((await del()).status).toBe(404);
  });
  it('deletes the whole journal and says how many went', async () => {
    const res = await DELETE_ALL();
    expect(await res.json()).toEqual({ success: true, data: { removed: 3 }, error: null });
  });
  it('answers 404 for an entry that is not the user’s', async () => {
    editEntryText.mockResolvedValueOnce(null);
    expect((await patch({ postMortem: 'x' })).status).toBe(404);
  });
});
