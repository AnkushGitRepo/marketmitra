import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { userId: 'u1' as string | null, criteria: [{ id: 'roce' }] as Array<{ id: string }> | null, calls: [] as unknown[], analyst: { symbol: 'ACC', dossier: {} } as { symbol: string; dossier: object | null } | null };

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/analysts/store', () => ({
  deleteAnalyst: async () => true,
  getAnalyst: async () => state.analyst,
  listJournal: async () => [],
  setStatus: async () => true,
  updateCriterion: async (...args: unknown[]) => (state.calls.push(args), state.criteria),
}));

const { PATCH } = await import('./route');
const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ symbol: 'acc' }) });

beforeEach(() => {
  state.userId = 'u1';
  state.criteria = [{ id: 'roce' }];
  state.calls = [];
  state.analyst = { symbol: 'ACC', dossier: {} };
});

describe('PATCH /api/analysts/[symbol] - thesis criteria', () => {
  it('needs a session', async () => {
    state.userId = null;
    expect((await patch({ criterion: { id: 'roce', action: 'disable' } })).status).toBe(401);
  });
  it('switches a criterion and returns the new list', async () => {
    const res = await patch({ criterion: { id: 'roce', action: 'disable' } });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { criteria: unknown[] } }).data.criteria).toEqual([{ id: 'roce' }]);
    expect(state.calls).toEqual([['u1', 'acc', 'roce', 'disable']]);
  });
  it('404s for a criterion that does not exist, and rejects unknown metrics and actions', async () => {
    state.criteria = null;
    expect((await patch({ criterion: { id: 'roce', action: 'remove' } })).status).toBe(404);
    expect((await patch({ criterion: { id: 'sharePrice', action: 'remove' } })).status).toBe(422);
    expect((await patch({ criterion: { id: 'roce', action: 'explode' } })).status).toBe(422);
  });
  it('still pauses and resumes', async () => {
    expect((await patch({ status: 'paused' })).status).toBe(200);
    expect(state.calls).toEqual([]);
  });
});
