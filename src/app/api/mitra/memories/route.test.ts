import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  store: { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn(), removeAll: vi.fn() },
}));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/lib/mitra-chat/memory/store', () => ({ liveMemoryStore: h.store }));

import { DELETE as deleteOne, PATCH } from './[id]/route';
import { DELETE as deleteAll, GET, POST } from './route';

const post = (body: unknown) => POST(new Request('http://localhost/api/mitra/memories', { method: 'POST', body: JSON.stringify(body) }));
const patch = (id: string, body: unknown) => PATCH(new Request('http://localhost/x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
const del = (id: string) => deleteOne(new Request('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id }) });
const mem = { id: 'a1', text: 'Long-term investor', kind: 'profile', source: 'manual', createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUserId.mockResolvedValue('u1');
  h.store.list.mockResolvedValue([mem]);
  h.store.add.mockResolvedValue(mem);
  h.store.update.mockResolvedValue(mem);
  h.store.remove.mockResolvedValue(mem);
  h.store.removeAll.mockResolvedValue(3);
});

describe('/api/mitra/memories', () => {
  it('401s every method without a user', async () => {
    h.getCurrentUserId.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await post({ text: 'Long-term investor' })).status).toBe(401);
    expect((await deleteAll()).status).toBe(401);
    expect((await patch('a1', { text: 'Long-term investor' })).status).toBe(401);
    expect((await del('a1')).status).toBe(401);
  });

  it('lists only the signed-in user’s memories', async () => {
    const res = await GET();
    expect((await res.json()).data).toHaveLength(1);
    expect(h.store.list).toHaveBeenCalledWith('u1');
  });

  it('adds a memory the user wrote, marked manual', async () => {
    const res = await post({ text: '  Long-term investor, 10 year horizon ', kind: 'profile' });
    expect(res.status).toBe(201);
    expect(h.store.add).toHaveBeenCalledWith('u1', { text: 'Long-term investor, 10 year horizon', kind: 'profile', source: 'manual' });
  });

  it('refuses a short, long or private memory', async () => {
    expect((await post({ text: 'ab' })).status).toBe(422);
    expect((await post({ text: 'x'.repeat(301) })).status).toBe(422);
    const sensitive = await post({ text: 'my PAN is ABCDE1234F' });
    expect(sensitive.status).toBe(422);
    expect((await sensitive.json()).error).toMatch(/never stored/);
    expect(h.store.add).not.toHaveBeenCalled();
  });

  it('409s when memory is full', async () => {
    h.store.add.mockResolvedValue(null);
    expect((await post({ text: 'Long-term investor' })).status).toBe(409);
  });

  it('edits and deletes one memory of this user, and 404s one that is not theirs', async () => {
    expect((await patch('a1', { text: 'Now a 15 year horizon' })).status).toBe(200);
    expect(h.store.update).toHaveBeenCalledWith('u1', 'a1', { text: 'Now a 15 year horizon', kind: undefined });
    expect((await del('a1')).status).toBe(200);
    expect(h.store.remove).toHaveBeenCalledWith('u1', 'a1');
    h.store.remove.mockResolvedValue(null);
    h.store.update.mockResolvedValue(null);
    expect((await del('someone-elses')).status).toBe(404);
    expect((await patch('someone-elses', { text: 'Long-term investor' })).status).toBe(404);
  });

  it('forgets everything for this user', async () => {
    const res = await deleteAll();
    expect((await res.json()).data.removed).toBe(3);
    expect(h.store.removeAll).toHaveBeenCalledWith('u1');
  });
});
