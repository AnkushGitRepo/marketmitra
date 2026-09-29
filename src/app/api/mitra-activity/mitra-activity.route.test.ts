import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUserId, listMitraActions } = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  listMitraActions: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
}));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
vi.mock('@/lib/mitra/activityLog', () => ({ listMitraActions }));

const { GET } = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/mitra-activity', () => {
  it('requires authentication', async () => {
    getCurrentUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(listMitraActions).not.toHaveBeenCalled();
  });

  it("returns the current user's actions, scoped by userId", async () => {
    getCurrentUserId.mockResolvedValue('u1');
    listMitraActions.mockResolvedValue([{ id: 'm1', userId: 'u1', action: 'alert_created' }]);
    const res = await GET();
    expect(listMitraActions).toHaveBeenCalledWith('u1');
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});
