import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { userId: 'u1' as string | null, requeued: 3, calls: [] as string[] };

vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/analysts/store', () => ({ requeueStalled: async (u: string) => (state.calls.push(u), state.requeued) }));

const { POST } = await import('./route');
const call = () => (POST as () => Promise<Response>)();

beforeEach(() => {
  state.userId = 'u1';
  state.requeued = 3;
  state.calls = [];
});

describe('POST /api/analysts/retry', () => {
  it('needs a session and touches nothing without one', async () => {
    state.userId = null;
    expect((await call()).status).toBe(401);
    expect(state.calls).toEqual([]);
  });
  it("re-queues only the signed-in user's stalled analysts and says how many", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: { requeued: number } }).data.requeued).toBe(3);
    expect(state.calls).toEqual(['u1']);
  });
});
