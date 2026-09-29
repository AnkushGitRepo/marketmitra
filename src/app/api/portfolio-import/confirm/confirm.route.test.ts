import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Holding } from '@/lib/holdings';

const { getCurrentUserId, holdings, createGuardrailAlertsForHolding } = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  holdings: {
    addHolding: vi.fn(),
    updateHolding: vi.fn(),
  },
  createGuardrailAlertsForHolding: vi.fn(async () => []),
}));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
vi.mock('@/lib/holdings', () => holdings);
vi.mock('@/lib/alerts/guardrails', () => ({ createGuardrailAlertsForHolding }));

const { POST } = await import('./route');

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/portfolio-import/confirm', { method: 'POST', body: JSON.stringify(body) }));

const sampleHolding = (over: Partial<Holding> = {}): Holding => ({
  id: 'h1',
  userId: 'u1',
  symbol: 'TCS',
  quantity: 10,
  avgPrice: 3200,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('POST /api/portfolio-import/confirm', () => {
  it('requires authentication', async () => {
    getCurrentUserId.mockResolvedValue(null);
    const res = await post({ changes: [] });
    expect(res.status).toBe(401);
  });

  it('rejects an empty or malformed body', async () => {
    const res = await post({ changes: [] });
    expect(res.status).toBe(422);
  });

  it('creates a new holding for a create action', async () => {
    holdings.addHolding.mockResolvedValue(sampleHolding());
    const res = await post({
      changes: [
        { matchedSymbol: 'TCS', action: 'create', existingHoldingId: null, after: { quantity: 10, avgPrice: 3200 } },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ succeeded: 1, failedSymbols: [] });
    expect(holdings.addHolding).toHaveBeenCalledWith('u1', { symbol: 'TCS', quantity: 10, avgPrice: 3200 });
    expect(holdings.updateHolding).not.toHaveBeenCalled();
    // A brand-new holding gets the default guardrail alerts (ADR 0030).
    expect(createGuardrailAlertsForHolding).toHaveBeenCalledWith('u1', 'TCS');
  });

  it('updates an existing holding for an update action', async () => {
    holdings.updateHolding.mockResolvedValue(sampleHolding({ quantity: 15 }));
    const res = await post({
      changes: [
        {
          matchedSymbol: 'TCS',
          action: 'update',
          existingHoldingId: 'h1',
          after: { quantity: 15, avgPrice: 3300 },
        },
      ],
    });
    const body = await res.json();
    expect(body.data).toEqual({ succeeded: 1, failedSymbols: [] });
    expect(holdings.updateHolding).toHaveBeenCalledWith('u1', 'h1', { quantity: 15, avgPrice: 3300 });
    expect(holdings.addHolding).not.toHaveBeenCalled();
    // An update to an existing holding is not a "new" holding — no guardrails fired.
    expect(createGuardrailAlertsForHolding).not.toHaveBeenCalled();
  });

  it('reports a symbol as failed when its update target no longer exists', async () => {
    holdings.updateHolding.mockResolvedValue(null);
    const res = await post({
      changes: [
        { matchedSymbol: 'TCS', action: 'update', existingHoldingId: 'gone', after: { quantity: 1, avgPrice: 1 } },
      ],
    });
    const body = await res.json();
    expect(body.data).toEqual({ succeeded: 0, failedSymbols: ['TCS'] });
  });

  it('processes a mixed batch independently, one failure does not block the rest', async () => {
    holdings.addHolding
      .mockResolvedValueOnce(sampleHolding({ symbol: 'TCS' }))
      .mockRejectedValueOnce(new Error('db down'));
    const res = await post({
      changes: [
        { matchedSymbol: 'TCS', action: 'create', existingHoldingId: null, after: { quantity: 1, avgPrice: 1 } },
        { matchedSymbol: 'INFY', action: 'create', existingHoldingId: null, after: { quantity: 1, avgPrice: 1 } },
      ],
    });
    const body = await res.json();
    expect(body.data).toEqual({ succeeded: 1, failedSymbols: ['INFY'] });
  });
});
