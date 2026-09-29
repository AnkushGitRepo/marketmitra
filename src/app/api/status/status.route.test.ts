import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSystemStatus } = vi.hoisted(() => ({ getSystemStatus: vi.fn() }));
vi.mock('@/lib/system/health', () => ({ getSystemStatus }));

import { GET } from './route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/status', () => {
  it('is public (no auth check) and returns the status payload', async () => {
    const fake = { checkedAt: '2026-01-01T00:00:00.000Z', overall: 'operational', components: [], crons: [] };
    getSystemStatus.mockResolvedValue(fake);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: fake });
  });
});
