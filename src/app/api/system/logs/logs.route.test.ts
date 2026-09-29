import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCurrentUserId, listEvents } = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  listEvents: vi.fn(),
}));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
vi.mock('@/lib/system/eventLog', () => ({ listEvents }));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
  listEvents.mockResolvedValue([]);
});

describe('GET /api/system/logs', () => {
  it('401s when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/system/logs'));
    expect(res.status).toBe(401);
    expect(listEvents).not.toHaveBeenCalled();
  });

  it('passes through level/source/limit/before filters', async () => {
    await GET(
      new Request(
        'http://localhost/api/system/logs?level=error&source=cron:evaluate-alerts&limit=10&before=2026-01-01T00:00:00.000Z'
      )
    );
    expect(listEvents).toHaveBeenCalledWith({
      level: 'error',
      source: 'cron:evaluate-alerts',
      limit: 10,
      before: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('ignores an invalid level and a malformed before timestamp', async () => {
    await GET(new Request('http://localhost/api/system/logs?level=bogus&before=not-a-date'));
    expect(listEvents).toHaveBeenCalledWith({
      level: undefined,
      source: undefined,
      limit: undefined,
      before: undefined,
    });
  });

  it('returns the events under data', async () => {
    listEvents.mockResolvedValue([{ id: 'e1', message: 'ran' }]);
    const res = await GET(new Request('http://localhost/api/system/logs'));
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [{ id: 'e1', message: 'ran' }] });
  });
});
