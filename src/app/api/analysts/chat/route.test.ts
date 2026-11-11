import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  userId: 'u1' as string | null,
  config: { provider: 'gemini' } as object | null,
  analyst: { symbol: 'ACC', dossier: null } as { symbol: string; dossier: null } | null,
  systems: [] as string[],
  budgets: [] as number[],
};

vi.mock('@/lib/rateLimit', () => ({ withRateLimit: (h: unknown) => h }));
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId: async () => state.userId }));
vi.mock('@/lib/ai/userAiConfig', () => ({ getUserAiConfig: async () => state.config }));
vi.mock('@/lib/ai/promptModeStore', () => ({ resolvePromptMode: async () => 'guarded' }));
vi.mock('@/lib/ai/portfolioContext', () => ({ buildPortfolioContext: async () => 'PORTFOLIO-BLOCK' }));
vi.mock('@/lib/ai/stockSignalsServer', () => ({ loadSignalBundle: async () => null }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: async () => undefined }));
vi.mock('@/lib/analysts/store', () => ({
  getAnalyst: async () => state.analyst,
  listJournal: async () => [],
  listAnalysts: async () => [{ symbol: 'ACC', status: 'active', dossier: { summary: 'Low debt.', vulnerabilities: [{ title: 'Profit drop' }] } }],
  latestEntries: async () => ({}),
}));
vi.mock('@/lib/ai/generate', () => ({
  streamChat: (_c: unknown, system: string, _m: unknown, opts: { maxOutputTokens?: number }) => (state.systems.push(system), state.budgets.push(opts?.maxOutputTokens ?? 0), { toUIMessageStreamResponse: () => new Response('stream', { status: 200 }) }),
}));

const { POST } = await import('./route');
const msg = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] };
const call = (body: unknown) => (POST as (r: Request) => Promise<Response>)(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
  state.userId = 'u1';
  state.config = { provider: 'gemini' };
  state.analyst = { symbol: 'ACC', dossier: null };
  state.systems = [];
  state.budgets = [];
});

describe('POST /api/analysts/chat', () => {
  it('needs a session', async () => {
    state.userId = null;
    expect((await call({ messages: [msg] })).status).toBe(401);
  });
  it('rejects a malformed body and bad messages', async () => {
    expect((await call({ messages: [] })).status).toBe(422);
    expect((await call({ messages: [{ nope: true }] })).status).toBe(422);
  });
  it('asks for an AI key before doing anything else', async () => {
    state.config = null;
    const res = await call({ symbol: 'ACC', messages: [msg] });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('no_ai_key');
  });
  it('404s for a stock without an analyst', async () => {
    state.analyst = null;
    expect((await call({ symbol: 'ZZZ', messages: [msg] })).status).toBe(404);
  });
  it('chats with a stock analyst grounded in its own context, not the desk', async () => {
    expect((await call({ symbol: 'acc', messages: [msg] })).status).toBe(200);
    expect(state.systems[0]).toContain('ANALYST CONTEXT');
    expect(state.systems[0]).not.toContain('DESK CONTEXT');
    expect(state.budgets[0]).toBeGreaterThan(2048);
    expect(state.systems[0]).toMatch(/Never tell the user what to do with a position/);
  });
  it('chats with the Root Agent over the whole desk and the portfolio when no symbol is given', async () => {
    expect((await call({ messages: [msg] })).status).toBe(200);
    expect(state.systems[0]).toContain('DESK CONTEXT');
    expect(state.systems[0]).toContain('ACC (active) | thesis: Low debt.');
    expect(state.systems[0]).toContain('PORTFOLIO-BLOCK');
  });
});
