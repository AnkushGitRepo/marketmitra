import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { initiated: 'initiated' as string, builds: 0, note: null as string | null, userId: 'u1' as string | null, criteria: [{ id: 'roce' }] as Array<{ id: string }> | null, calls: [] as unknown[], analyst: { symbol: 'ACC', dossier: {} } as { symbol: string; dossier: object | null } | null };

vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/analysts/deps', () => ({ realDeps: () => ({}) }));
vi.mock('@/lib/analysts/engine', () => ({ initiate: async () => (state.builds++, state.initiated) }));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/analysts/store', () => ({
  deleteAnalyst: async () => true,
  getAnalyst: async () => (state.analyst ? { ...state.analyst, statusNote: state.note } : null),
  listJournal: async () => [],
  setStatus: async () => true,
  updateCriterion: async (...args: unknown[]) => (state.calls.push(args), state.criteria),
}));

const { PATCH, POST } = await import('./route');
const post = (body: unknown) => (POST as (r: Request, c: { params: Promise<{ symbol: string }> }) => Promise<Response>)(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ symbol: 'acc' }) });
const patch = (body: unknown) => PATCH(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: Promise.resolve({ symbol: 'acc' }) });

beforeEach(() => {
  state.userId = 'u1';
  state.criteria = [{ id: 'roce' }];
  state.calls = [];
  state.analyst = { symbol: 'ACC', dossier: {} };
  state.initiated = 'initiated';
  state.builds = 0;
  state.note = null;
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

describe('POST /api/analysts/[symbol] - Analyze now and Retry', () => {
  beforeEach(() => {
    state.analyst = { symbol: 'ACC', dossier: null };
  });
  it('needs a session and the analyze action', async () => {
    state.userId = null;
    expect((await post({ action: 'analyze' })).status).toBe(401);
    state.userId = 'u1';
    expect((await post({ action: 'explode' })).status).toBe(422);
    expect(state.builds).toBe(0);
  });
  it('builds the dossier now', async () => {
    const res = await post({ action: 'analyze' });
    expect(res.status).toBe(200);
    expect(state.builds).toBe(1);
  });
  it('refuses to rebuild a finished dossier and does not build for a paused analyst or an unknown stock', async () => {
    state.analyst = { symbol: 'ACC', dossier: {} };
    expect((await post({ action: 'analyze' })).status).toBe(409);
    state.analyst = null;
    expect((await post({ action: 'analyze' })).status).toBe(404);
    expect(state.builds).toBe(0);
  });
  it('says plainly when the daily budget is spent, the key is missing, or the build failed (with its reason)', async () => {
    state.initiated = 'deferred';
    const spent = await post({ action: 'analyze' });
    expect(spent.status).toBe(409);
    expect(((await spent.json()) as { error: string }).error).toMatch(/budget/i);
    state.initiated = 'needs_key';
    expect((await post({ action: 'analyze' })).status).toBe(400);
    state.initiated = 'error';
    state.note = 'The AI provider returned an error: quota';
    const failed = await post({ action: 'analyze' });
    expect(failed.status).toBe(502);
    expect(((await failed.json()) as { error: string }).error).toBe('The AI provider returned an error: quota');
  });
});
