import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  getUserAiConfig: vi.fn(),
  getCompany: vi.fn(),
  searchSymbols: vi.fn(),
  gatherReportInputs: vi.fn(),
  liveRunDeps: vi.fn(),
  runReport: vi.fn(),
}));

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: h.getUserAiConfig }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({
  getCompany: h.getCompany, searchSymbols: h.searchSymbols, getRatios: vi.fn(), getFinancials: vi.fn(), getShareholding: vi.fn(),
  getPeers: vi.fn(), getPrices: vi.fn(), getAnnouncements: vi.fn(), getInsights: vi.fn(),
}));
vi.mock('@/lib/research/report/gather', () => ({ gatherReportInputs: h.gatherReportInputs }));
vi.mock('@/lib/research/report/liveDeps', () => ({ liveRunDeps: h.liveRunDeps }));
vi.mock('@/lib/research/report/run', () => ({ runReport: h.runReport }));

import { POST } from './route';

const call = (body: unknown) => POST(new Request('http://localhost/api/research/report', { method: 'POST', body: JSON.stringify(body) }));

async function* events() {
  yield { type: 'start', symbol: 'BHARTIARTL', name: 'Bharti Airtel', chapters: [] };
  yield { type: 'done', model: 'gemini', generatedAt: '2026-11-25T10:00:00Z', content: '## x', note: { title: 't', symbol: 'BHARTIARTL', tickers: ['BHARTIARTL'] } };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUserId.mockResolvedValue('u1');
  h.getUserAiConfig.mockResolvedValue({ provider: 'gemini', apiKey: 'k', model: null });
  h.getCompany.mockImplementation(async (s: string) => (s === 'BHARTIARTL' ? { name: 'Bharti Airtel' } : null));
  h.searchSymbols.mockResolvedValue([]);
  h.gatherReportInputs.mockResolvedValue({ symbol: 'BHARTIARTL' });
  h.liveRunDeps.mockReturnValue({});
  h.runReport.mockImplementation(() => events());
});

describe('POST /api/research/report', () => {
  it('401s when unauthenticated, 422s on a bad body, and 400s with no AI key', async () => {
    h.getCurrentUserId.mockResolvedValueOnce(null);
    expect((await call({ symbol: 'X' })).status).toBe(401);
    expect((await call({})).status).toBe(422);
    h.getUserAiConfig.mockResolvedValueOnce(null);
    const noKey = await call({ symbol: 'AIRTEL' });
    expect(noKey.status).toBe(400);
    expect((await noKey.json()).error).toBe('no_ai_key');
  });

  it('404s naming a company that matches nothing, before spending any model call', async () => {
    const res = await call({ symbol: 'NOTACO' });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('"NOTACO"');
    expect(h.runReport).not.toHaveBeenCalled();
  });

  it('502s when the company’s data cannot be loaded', async () => {
    h.gatherReportInputs.mockResolvedValueOnce(null);
    expect((await call({ symbol: 'AIRTEL' })).status).toBe(502);
  });

  it('resolves an alias, then streams the events as one JSON object per line', async () => {
    const res = await call({ symbol: 'airtel' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(h.gatherReportInputs.mock.calls[0][0]).toBe('BHARTIARTL');
    expect(h.liveRunDeps).toHaveBeenCalledWith({ provider: 'gemini', apiKey: 'k', model: null }, 'u1', 'BHARTIARTL');

    const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l) as { type: string });
    expect(lines.map((l) => l.type)).toEqual(['start', 'done']);
  });

  it('ends the stream with an error event, not a broken connection, if the run throws', async () => {
    h.runReport.mockImplementation(async function* () {
      yield { type: 'start', symbol: 'X', name: 'X', chapters: [] };
      throw new Error('boom');
    });
    const lines = (await (await call({ symbol: 'airtel' })).text()).trim().split('\n').map((l) => JSON.parse(l) as { type: string; message?: string });
    expect(lines.at(-1)).toEqual({ type: 'error', message: 'The report stopped unexpectedly. Try again.' });
  });
});
