import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn(async (): Promise<string | null> => 'u1');
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
const createBullion = vi.fn(async (): Promise<object | null> => ({ id: 'b1', metal: 'gold', purity: '24k', grams: 50 }));
const updateBullion = vi.fn(async (): Promise<object | null> => ({ id: 'b1' }));
const deleteBullion = vi.fn(async () => true);
vi.mock('@/lib/bullion/store', () => ({ listBullion: vi.fn(async () => [{ id: 'b1', metal: 'gold', purity: '24k', grams: 10, buyPricePerGram: null, note: null }]), createBullion, updateBullion, deleteBullion }));
vi.mock('@/lib/commodities/getCommodities', () => ({ getCommodities: vi.fn(async () => null) }));

const { GET, POST } = await import('./route');
const { PATCH, DELETE } = await import('./[id]/route');

const post = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'b1' }) });
const del = () => DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'b1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('/api/bullion', () => {
  it('requires sign-in everywhere', async () => {
    getCurrentUserId.mockResolvedValue(null);
    for (const res of [await GET(), await post({ metal: 'gold', grams: 5 }), await patch({ grams: 5 }), await del()]) expect(res.status).toBe(401);
  });
  it('lists entries as estimates, with no value when no price is available', async () => {
    const body = await (await GET()).json();
    expect(body.data.estimate).toBe(true);
    expect(body.data.rows[0].value).toBeNull();
    expect(body.data.unpriced).toBe(1);
  });
  it('creates a valid entry', async () => {
    expect((await post({ metal: 'gold', purity: '22k', grams: 50, buyPricePerGram: 9000 })).status).toBe(201);
    expect(createBullion).toHaveBeenCalledWith('u1', { metal: 'gold', purity: '22k', grams: 50, buyPricePerGram: 9000 });
  });
  it('rejects bad weights, unknown metals and purity on silver', async () => {
    for (const bad of [{ metal: 'gold', grams: 0 }, { metal: 'gold', grams: '5' }, { metal: 'copper', grams: 5 }, { metal: 'silver', purity: '24k', grams: 5 }, { grams: 5 }]) expect((await post(bad)).status).toBe(422);
    expect(createBullion).not.toHaveBeenCalled();
  });
  it('answers 409 at the cap', async () => {
    createBullion.mockResolvedValueOnce(null);
    expect((await post({ metal: 'gold', grams: 5 })).status).toBe(409);
  });
  it('updates, needs a field, and reports a missing entry', async () => {
    expect((await patch({ grams: 10 })).status).toBe(200);
    expect((await patch({})).status).toBe(422);
    updateBullion.mockResolvedValueOnce(null);
    expect((await patch({ grams: 10 })).status).toBe(404);
  });
  it('deletes, or reports a missing entry', async () => {
    expect((await del()).status).toBe(200);
    deleteBullion.mockResolvedValueOnce(false);
    expect((await del()).status).toBe(404);
  });
});
