import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  getUserAiConfig: vi.fn(),
  gather: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: h.getUserAiConfig }));
vi.mock('@/lib/research/portfolio/gather', () => ({ gatherPortfolioInputs: h.gather }));
vi.mock('@/lib/research/portfolio/liveDeps', () => ({ livePortfolioGetters: vi.fn(() => ({})), livePortfolioDeps: vi.fn(() => ({})) }));
vi.mock('@/lib/research/portfolio/run', () => ({ runPortfolioReport: h.run }));

import { POST } from './route';

const call = () => POST(new Request('http://localhost/api/research/portfolio-report', { method: 'POST' }));

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUserId.mockResolvedValue('u1');
  h.getUserAiConfig.mockResolvedValue({ provider: 'gemini', apiKey: 'k' });
  h.gather.mockResolvedValue({ positions: [], omitted: 0 });
  h.run.mockImplementation(async function* () {
    yield { type: 'start', symbol: 'My portfolio', name: 'My portfolio', chapters: [] };
    yield { type: 'error', message: 'stop' };
  });
});

describe('POST /api/research/portfolio-report', () => {
  it('401s when unauthenticated', async () => {
    h.getCurrentUserId.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });
  it('400s with no AI key, before any data is loaded', async () => {
    h.getUserAiConfig.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
    expect(h.gather).not.toHaveBeenCalled();
  });
  it('404s an empty portfolio and spends no model call', async () => {
    h.gather.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    expect(h.run).not.toHaveBeenCalled();
  });
  it('streams the report as newline-delimited JSON', async () => {
    const res = await call();
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['start', 'error']);
  });
});
