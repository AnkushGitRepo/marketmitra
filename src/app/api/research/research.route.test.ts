import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getCurrentUserId: vi.fn<() => Promise<string | null>>(),
  getUserAiConfig: vi.fn(),
  generateInsightText: vi.fn(),
  retrieveInsightGrounding: vi.fn(),
  getCompany: vi.fn(),
  getRatios: vi.fn(),
  getFinancials: vi.fn(),
  getShareholding: vi.fn(),
  getPrices: vi.fn(),
  getPeers: vi.fn(),
  getEnrichedHoldings: vi.fn(),
  searchSymbols: vi.fn(),
  themeFacts: vi.fn(),
}));

vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: h.getCurrentUserId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: h.getUserAiConfig }));
vi.mock('@/lib/ai/generate', () => ({ generateInsightText: h.generateInsightText }));
vi.mock('@/lib/rag/insightContext', () => ({ retrieveInsightGrounding: h.retrieveInsightGrounding }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({
  getCompany: h.getCompany,
  getRatios: h.getRatios,
  getFinancials: h.getFinancials,
  getShareholding: h.getShareholding,
  getPrices: h.getPrices,
  getPeers: h.getPeers,
  searchSymbols: h.searchSymbols,
}));
vi.mock('@/lib/research/themeFacts', () => ({ themeFacts: h.themeFacts }));
vi.mock('@/lib/dashboard/enrichedHoldings', () => ({ getEnrichedHoldings: h.getEnrichedHoldings }));

import { POST } from './route';

const call = (body: unknown) =>
  POST(new Request('http://localhost/api/research', { method: 'POST', body: JSON.stringify(body) }));

const THESIS_JSON = JSON.stringify({
  summary: '## What it is\nAn energy conglomerate.',
  catalysts: ['New energy build-out'],
  risks: ['Refining margins'],
  questions: ['How is capex funded?'],
});

beforeEach(() => {
  vi.clearAllMocks();
  h.getCurrentUserId.mockResolvedValue('u1');
  h.getUserAiConfig.mockResolvedValue({ provider: 'gemini', apiKey: 'k' });
  h.generateInsightText.mockResolvedValue({ ok: true, text: THESIS_JSON, model: 'gemini' });
  h.retrieveInsightGrounding.mockResolvedValue({ passages: [], text: '' });
  h.getCompany.mockResolvedValue({ name: 'Reliance Industries', sector: 'Energy', industry: 'Refining', about: null });
  h.getRatios.mockResolvedValue([]);
  h.getFinancials.mockResolvedValue([]);
  h.getShareholding.mockResolvedValue([]);
  h.getPrices.mockResolvedValue([]);
  h.searchSymbols.mockResolvedValue([]);
  h.getPeers.mockResolvedValue([]);
  h.themeFacts.mockResolvedValue({
    factBlocks: [{ heading: 'Telecommunications — largest listed companies', body: '- BHARTIARTL' }],
    blocks: [{ type: 'kpi_grid', items: [{ label: 'Listed companies', value: '29' }] }],
  });
  h.getEnrichedHoldings.mockResolvedValue([
    { symbol: 'TCS', name: 'TCS', sector: 'IT', quantity: 5, avgPrice: 3000, ltp: 3200 },
  ]);
});

describe('POST /api/research', () => {
  it('401s when unauthenticated', async () => {
    h.getCurrentUserId.mockResolvedValue(null);
    expect((await call({ subject: { type: 'portfolio' } })).status).toBe(401);
  });

  it('422s on an invalid subject', async () => {
    expect((await call({ subject: { type: 'company' } })).status).toBe(422); // missing symbol
    expect((await call({ subject: { type: 'comparison', symbols: ['ONE'] } })).status).toBe(422); // <2
  });

  it('400s with no AI key', async () => {
    h.getUserAiConfig.mockResolvedValue(null);
    const res = await call({ subject: { type: 'company', symbol: 'RELIANCE' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('no_ai_key');
  });

  it('400s a portfolio brief with no holdings', async () => {
    h.getEnrichedHoldings.mockResolvedValue([]);
    expect((await call({ subject: { type: 'portfolio' } })).status).toBe(400);
  });

  it('404s a company brief when the symbol matches nothing, naming it', async () => {
    h.getCompany.mockResolvedValue(null);
    const res = await call({ subject: { type: 'company', symbol: 'NOPE' } });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain('"NOPE"');
  });

  it('resolves an alias to the NSE symbol before researching', async () => {
    await call({ subject: { type: 'company', symbol: 'airtel' } });
    expect(h.getCompany).toHaveBeenCalledWith('BHARTIARTL');
    expect(h.generateInsightText.mock.calls[0][2]).toContain('(BHARTIARTL)');
  });

  it('404s a comparison when any symbol is unresolved', async () => {
    h.getCompany.mockImplementation(async (s: string) => (s === 'TCS' ? { name: 'TCS', sector: null, industry: null, about: null } : null));
    const res = await call({ subject: { type: 'comparison', symbols: ['TCS', 'NOPE'] } });
    expect(res.status).toBe(404);
    expect(h.generateInsightText).not.toHaveBeenCalled();
  });

  it('puts the theme sector facts in the prompt', async () => {
    await call({ subject: { type: 'theme', text: 'Indian Telecom' } });
    expect(h.themeFacts).toHaveBeenCalledWith('Indian Telecom');
    expect(h.generateInsightText.mock.calls[0][2]).toContain('BHARTIARTL');
  });

  it('generates a company brief and passes the structured system prompt + a company subject line', async () => {
    const res = await call({ subject: { type: 'company', symbol: 'RELIANCE' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.summary).toContain('## What it is');
    expect(body.data.content).toContain('## What it is');
    expect(body.data.content).toContain('New energy build-out');
    expect(body.meta.structured).toBe(true);
    expect(body.data.blocks.map((b: { type: string }) => b.type)).toEqual(['kpi_grid', 'thesis_bento']);

    const [, system, prompt, opts] = h.generateInsightText.mock.calls[0];
    expect(system).toContain('research brief');
    expect(system).toContain('not investment advice');
    expect(prompt).toContain('Reliance Industries (RELIANCE)');
    expect(opts.maxOutputTokens).toBeGreaterThan(2048);
  });

  it('fans out a comparison over each symbol', async () => {
    h.getCompany.mockImplementation(async (s: string) =>
      s === 'TCS' ? { name: 'TCS', sector: 'IT', industry: 'IT Services', about: null } : { name: 'Infosys', sector: 'IT', industry: 'IT Services', about: null }
    );
    const res = await call({ subject: { type: 'comparison', symbols: ['TCS', 'INFY'] } });
    expect(res.status).toBe(200);
    const prompt = h.generateInsightText.mock.calls[0][2] as string;
    expect(prompt).toContain('[TCS]');
    expect(prompt).toContain('[INFY]');
  });

  it('falls back to the plain reply when the model does not return the JSON', async () => {
    h.generateInsightText.mockResolvedValue({ ok: true, text: '## What it is\nPlain markdown.', model: 'gemini' });
    const body = await (await call({ subject: { type: 'company', symbol: 'RELIANCE' } })).json();
    expect(body.meta.structured).toBe(false);
    expect(body.data.summary).toBe('## What it is\nPlain markdown.');
    expect(body.data.blocks.map((b: { type: string }) => b.type)).toEqual(['kpi_grid']);
  });

  it('draws portfolio blocks from the holdings', async () => {
    const body = await (await call({ subject: { type: 'portfolio' } })).json();
    expect(body.data.blocks.map((b: { type: string }) => b.type)).toEqual([
      'kpi_grid',
      'donut_chart',
      'bar_chart',
      'data_table',
      'thesis_bento',
    ]);
  });

  it('502s when generation fails', async () => {
    h.generateInsightText.mockResolvedValue({ ok: false, error: 'quota exceeded' });
    const res = await call({ subject: { type: 'theme', text: 'PSU banks' } });
    expect(res.status).toBe(502);
  });
});
