import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  getUserAiConfig: vi.fn(),
  gather: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: h.getUserAiConfig }));
vi.mock('@/lib/dashboard/screener', () => ({ getScreenerFacets: vi.fn(), runScreenerPage: vi.fn() }));
vi.mock('@/lib/research/sector/gather', () => ({ gatherSectorInputs: h.gather }));
vi.mock('@/lib/research/sector/liveDeps', () => ({ liveSectorDeps: vi.fn(() => ({})) }));
vi.mock('@/lib/research/sector/run', () => ({ runSectorReport: h.run }));

import { POST } from './route';

const call = (body: unknown) => POST(new Request('http://localhost/api/research/sector-report', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUserId.mockResolvedValue('u1');
  h.getUserAiConfig.mockResolvedValue({ provider: 'gemini', apiKey: 'k' });
  h.gather.mockResolvedValue({ label: 'Defence & Aerospace' });
  h.run.mockImplementation(async function* () {
    yield { type: 'start', symbol: 'x', name: 'Defence & Aerospace', chapters: [] };
    yield { type: 'error', message: 'stop' };
  });
});

describe('POST /api/research/sector-report', () => {
  it('401s when unauthenticated', async () => {
    h.getCurrentUserId.mockResolvedValue(null);
    expect((await call({ theme: 'defence' })).status).toBe(401);
  });
  it('422s without a usable theme', async () => {
    expect((await call({})).status).toBe(422);
    expect((await call({ theme: 'x' })).status).toBe(422);
  });
  it('400s with no AI key, before any data is loaded', async () => {
    h.getUserAiConfig.mockResolvedValue(null);
    const res = await call({ theme: 'defence' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
    expect(h.gather).not.toHaveBeenCalled();
  });
  it('404s an unknown theme, naming it, and spends no model call', async () => {
    h.gather.mockResolvedValue(null);
    const res = await call({ theme: 'zzzz' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('"zzzz"');
    expect(h.run).not.toHaveBeenCalled();
  });
  it('streams the report as newline-delimited JSON', async () => {
    const res = await call({ theme: 'defence' });
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['start', 'error']);
  });
});
