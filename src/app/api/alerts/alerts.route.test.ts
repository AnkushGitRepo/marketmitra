import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from '@/lib/alerts/types';

const { getCurrentUserId, store } = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  store: {
    listAlerts: vi.fn(),
    createAlert: vi.fn(),
    getAlertById: vi.fn(),
    updateAlert: vi.fn(),
    deleteAlert: vi.fn(),
    upsertIpoWatch: vi.fn(),
  },
}));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
vi.mock('@/lib/alerts/store', () => store);

import { GET, POST } from './route';
import { DELETE, PATCH } from './[id]/route';

const sampleAlert = (over: Partial<Alert> = {}): Alert => ({
  id: 'a1',
  userId: 'u1',
  type: 'price_threshold',
  symbol: 'RELIANCE',
  params: { direction: 'above', threshold: 1000 },
  note: null,
  status: 'active',
  rearm: false,
  cooldownMinutes: 60,
  armed: true,
  cooldownUntil: null,
  lastEvaluatedAt: null,
  triggeredAt: null,
  lastObservedValue: null,
  sentKeys: null,
  peakPrice: null,
  source: 'user',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/alerts', { method: 'POST', body: JSON.stringify(body) }));
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://localhost/api/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('GET /api/alerts', () => {
  it('401s when unauthenticated', async () => {
    getCurrentUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns the user\'s alerts', async () => {
    store.listAlerts.mockResolvedValue([sampleAlert()]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [expect.objectContaining({ id: 'a1' })] });
    expect(store.listAlerts).toHaveBeenCalledWith('u1');
  });
});

describe('POST /api/alerts', () => {
  it('creates a valid price_threshold alert', async () => {
    store.createAlert.mockImplementation(async (_u: string, input: unknown) => sampleAlert(input as Partial<Alert>));
    const res = await post({
      type: 'price_threshold',
      symbol: 'reliance',
      params: { direction: 'above', threshold: 1400 },
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    // symbol upper-cased by the schema
    expect(store.createAlert).toHaveBeenCalledWith('u1', expect.objectContaining({ symbol: 'RELIANCE' }));
  });

  it('422s on a bad discriminated-union payload', async () => {
    const res = await post({ type: 'price_threshold', symbol: 'RELIANCE', params: { direction: 'sideways', threshold: 1 } });
    expect(res.status).toBe(422);
    expect(store.createAlert).not.toHaveBeenCalled();
  });

  it('422s when a required param is missing', async () => {
    const res = await post({ type: 'percent_move', symbol: 'RELIANCE', params: { direction: 'up' } });
    expect(res.status).toBe(422);
  });

  it('allows a whole-portfolio alert with no symbol', async () => {
    store.createAlert.mockResolvedValue(sampleAlert({ type: 'portfolio_pnl', symbol: null }));
    const res = await post({
      type: 'portfolio_pnl',
      params: { metric: 'total_value', direction: 'above', threshold: 1000000 },
    });
    expect(res.status).toBe(201);
    expect(store.createAlert).toHaveBeenCalledWith('u1', expect.objectContaining({ symbol: null }));
  });
});

describe('PATCH /api/alerts/[id]', () => {
  it('404s when the alert is not the caller\'s', async () => {
    store.getAlertById.mockResolvedValue(null);
    const res = await patch('a1', { status: 'paused' });
    expect(res.status).toBe(404);
  });

  it('validates params against the existing alert\'s type', async () => {
    store.getAlertById.mockResolvedValue(sampleAlert({ type: 'price_threshold' }));
    const bad = await patch('a1', { params: { edge: 'high' } }); // wrong shape for price_threshold
    expect(bad.status).toBe(422);
    expect(store.updateAlert).not.toHaveBeenCalled();

    store.updateAlert.mockResolvedValue(sampleAlert());
    const ok = await patch('a1', { params: { direction: 'below', threshold: 900 } });
    expect(ok.status).toBe(200);
    expect(store.updateAlert).toHaveBeenCalledWith(
      'u1',
      'a1',
      expect.objectContaining({ params: { direction: 'below', threshold: 900 } })
    );
  });
});

describe('DELETE /api/alerts/[id]', () => {
  it('deletes and 404s appropriately', async () => {
    store.deleteAlert.mockResolvedValue(true);
    const ok = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'a1' }),
    });
    expect(ok.status).toBe(200);

    store.deleteAlert.mockResolvedValue(false);
    const missing = await DELETE(new Request('http://localhost/x', { method: 'DELETE' }), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(missing.status).toBe(404);
  });
});
