import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  getUserAiConfig: vi.fn(),
  gather: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: h.getUserAiConfig }));
vi.mock('@/lib/research/compare/gather', async (original) => ({ ...(await original<typeof import('@/lib/research/compare/gather')>()), gatherCompareInputs: h.gather }));
vi.mock('@/lib/research/compare/liveDeps', () => ({ liveCompareGetters: vi.fn(() => ({})), liveCompareDeps: vi.fn(() => ({})) }));
vi.mock('@/lib/research/compare/run', () => ({ runCompareReport: h.run }));

import { POST } from './route';

const call = (body: unknown) => POST(new Request('http://localhost/api/research/compare-report', { method: 'POST', body: JSON.stringify(body) }));
const two = { symbols: ['JPL', 'BHARTIARTL'] };

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUserId.mockResolvedValue('u1');
  h.getUserAiConfig.mockResolvedValue({ provider: 'gemini', apiKey: 'k' });
  h.gather.mockResolvedValue({ companies: [{ symbol: 'JPL' }, { symbol: 'BHARTIARTL' }] });
  h.run.mockImplementation(async function* () {
    yield { type: 'start', symbol: 'x', name: 'JPL vs BHARTIARTL', chapters: [] };
    yield { type: 'error', message: 'stop' };
  });
});

describe('POST /api/research/compare-report', () => {
  it('401s when unauthenticated', async () => {
    h.getCurrentUserId.mockResolvedValue(null);
    expect((await call(two)).status).toBe(401);
  });
  it('422s unless there are two to four companies', async () => {
    expect((await call({})).status).toBe(422);
    expect((await call({ symbols: ['JPL'] })).status).toBe(422);
    expect((await call({ symbols: ['A', 'B', 'C', 'D', 'E'] })).status).toBe(422);
    expect((await call({ symbols: ['A', ''] })).status).toBe(422);
  });
  it('400s with no AI key, before any data is loaded', async () => {
    h.getUserAiConfig.mockResolvedValue(null);
    const res = await call(two);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
    expect(h.gather).not.toHaveBeenCalled();
  });
  it('404s an unknown company, naming it, and spends no model call', async () => {
    h.gather.mockResolvedValue({ unknown: ['zzzz'] });
    const res = await call({ symbols: ['JPL', 'zzzz'] });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('"zzzz"');
    expect(h.run).not.toHaveBeenCalled();
  });
  it('422s the same company twice', async () => {
    h.gather.mockResolvedValue({ companies: [{ symbol: 'JPL' }] });
    expect((await call({ symbols: ['JPL', 'jio'] })).status).toBe(422);
    expect(h.run).not.toHaveBeenCalled();
  });
  it('streams the report as newline-delimited JSON', async () => {
    const res = await call(two);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['start', 'error']);
  });
});
