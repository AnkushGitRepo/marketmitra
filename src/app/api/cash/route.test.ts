import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn(async (): Promise<string | null> => 'u1');
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
const createCash = vi.fn(async (): Promise<object | null> => ({ id: 'c1', label: 'Liquid fund', amount: 50000 }));
const updateCash = vi.fn(async (): Promise<object | null> => ({ id: 'c1' }));
const deleteCash = vi.fn(async () => true);
vi.mock('@/lib/cash/store', () => ({ listCash: vi.fn(async () => []), createCash, updateCash, deleteCash }));

const { GET, POST } = await import('./route');
const { PATCH, DELETE } = await import('./[id]/route');

const post = (body: unknown) => POST(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));
const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id: 'c1' }) });
const del = () => DELETE(new Request('http://x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'c1' }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('/api/cash', () => {
  it('requires sign-in everywhere', async () => {
    getCurrentUserId.mockResolvedValue(null);
    for (const res of [await GET(), await post({ label: 'x', amount: 1 }), await patch({ amount: 1 }), await del()]) expect(res.status).toBe(401);
  });
  it('creates a valid entry and allows a zero balance', async () => {
    expect((await post({ label: 'Savings', amount: 0 })).status).toBe(201);
    expect(createCash).toHaveBeenCalledWith('u1', { label: 'Savings', amount: 0 });
  });
  it('rejects negative, non-numeric and unlabelled entries', async () => {
    for (const bad of [{ label: 'x', amount: -1 }, { label: 'x', amount: '5' }, { label: '  ', amount: 5 }, { amount: 5 }]) expect((await post(bad)).status).toBe(422);
    expect(createCash).not.toHaveBeenCalled();
  });
  it('answers 409 at the cap', async () => {
    createCash.mockResolvedValueOnce(null);
    expect((await post({ label: 'x', amount: 1 })).status).toBe(409);
  });
  it('updates, needs a field, and reports a missing entry', async () => {
    expect((await patch({ amount: 10 })).status).toBe(200);
    expect((await patch({})).status).toBe(422);
    updateCash.mockResolvedValueOnce(null);
    expect((await patch({ amount: 10 })).status).toBe(404);
  });
  it('deletes, or reports a missing entry', async () => {
    expect((await del()).status).toBe(200);
    deleteCash.mockResolvedValueOnce(false);
    expect((await del()).status).toBe(404);
  });
});
