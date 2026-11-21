import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DASHBOARD_SPEC, NEWS_SPEC } from './briefSpecs';

const state = { result: { ok: true, text: '', model: 'm', finishReason: 'stop' } as Record<string, unknown>, opts: undefined as { maxOutputTokens?: number; tools?: unknown } | undefined, calls: [] as Array<{ tools?: unknown; thinkingLevel?: string }>, groundedResult: null as Record<string, unknown> | null };
vi.mock('./generate', () => ({
  generateInsightText: async (_c: unknown, _s: string, _p: string, opts?: { maxOutputTokens?: number; tools?: unknown; thinkingLevel?: string }) => {
    state.opts = opts;
    state.calls.push({ tools: opts?.tools, thinkingLevel: opts?.thinkingLevel });
    return (opts?.tools || opts?.thinkingLevel) && state.groundedResult ? state.groundedResult : state.result;
  },
}));
vi.mock('./providers', () => ({ groundingTools: (c: { provider?: string }) => (c.provider === 'gemini' ? { google_search: {} } : undefined) }));
const logEvent = vi.fn(async () => undefined);
vi.mock('@/lib/system/eventLog', () => ({ logEvent }));

const { generateStructuredBrief } = await import('./structuredGenerate');
const ok = (items: unknown[], extra: Record<string, unknown> = {}) => ({ ok: true, text: JSON.stringify({ items }), model: 'm', finishReason: 'stop', ...extra });
const run = (spec = DASHBOARD_SPEC, allowedTickers?: ReadonlySet<string>) =>
  generateStructuredBrief({ aiConfig: {} as never, system: 's', prompt: 'p', spec, allowedTickers });

beforeEach(() => {
  logEvent.mockClear();
  state.calls = [];
  state.groundedResult = null;
  state.result = ok([{ key: 'return', tone: 'positive', text: 'Net +₹1,200.' }]);
});

describe('generateStructuredBrief', () => {
  it('returns normalised JSON content and gives the model a generous output budget', async () => {
    const r = await run();
    expect(r).toMatchObject({ model: 'm' });
    expect(JSON.parse((r as { content: string }).content).items[0]).toEqual({ key: 'return', tone: 'positive', text: 'Net +₹1,200.' });
    expect(state.opts?.maxOutputTokens).toBeGreaterThanOrEqual(12000);
  });
  it('passes provider errors through', async () => {
    state.result = { ok: false, error: 'bad key' };
    expect(await run()).toEqual({ error: 'bad key' });
  });
  it('logs a short key-free snippet and the finish reason when the reply cannot be read', async () => {
    state.result = { ok: true, text: 'x'.repeat(2000), model: 'm', finishReason: 'stop' };
    const r = await run();
    expect((r as { error: string }).error).toMatch(/could not read/i);
    const meta = (logEvent.mock.calls[0] as unknown as [{ source: string; meta: { snippet: string } }])[0];
    expect(meta.source).toBe('insights:dashboard');
    expect(meta.meta.snippet).toHaveLength(600);
  });
  it('does not return a cut-off reply that is missing required items, and says why', async () => {
    state.result = ok([{ key: 'return', tone: 'positive', text: 'a' }], { finishReason: 'length' });
    const r = await run();
    expect((r as { error: string }).error).toMatch(/ran out of room/i);
  });
  it('keeps a cut-off reply that still has enough items', async () => {
    state.result = ok([{ key: 'return', tone: 'positive', text: 'a' }, { key: 'exposure', tone: 'neutral', text: 'b' }], { finishReason: 'length' });
    expect((await run()) as object).toHaveProperty('content');
  });
  it('removes [TICKER] tags that are not in the data', async () => {
    state.result = ok([{ key: 'earnings', tone: 'positive', text: '[PNB] beat; [FAKECO] jumped.' }]);
    const r = await run(NEWS_SPEC, new Set(['PNB']));
    expect(JSON.parse((r as { content: string }).content).items[0].text).toBe('[PNB] beat; FAKECO jumped.');
  });
  it('searches the web only when asked and only for a provider that has a search tool', async () => {
    const base = { system: 's', prompt: 'p', spec: DASHBOARD_SPEC };
    await generateStructuredBrief({ ...base, aiConfig: { provider: 'gemini' } as never, grounded: true });
    expect(state.calls).toEqual([{ tools: { google_search: {} }, thinkingLevel: undefined }]);
    state.calls = [];
    await generateStructuredBrief({ ...base, aiConfig: { provider: 'gemini' } as never });
    await generateStructuredBrief({ ...base, aiConfig: { provider: 'anthropic' } as never, grounded: true });
    expect(state.calls).toEqual([{ tools: undefined, thinkingLevel: undefined }, { tools: undefined, thinkingLevel: undefined }]);
  });
  it('retries without search when the grounded call fails', async () => {
    state.groundedResult = { ok: false, error: 'search tool not supported' };
    const r = await generateStructuredBrief({ system: 's', prompt: 'p', spec: DASHBOARD_SPEC, aiConfig: { provider: 'gemini' } as never, grounded: true });
    expect(r).toMatchObject({ model: 'm' });
    expect(state.calls).toEqual([{ tools: { google_search: {} }, thinkingLevel: undefined }, { tools: undefined, thinkingLevel: undefined }]);
  });
  it('caps Gemini thinking, and retries without the cap when the provider rejects it', async () => {
    const base = { system: 's', prompt: 'p', spec: DASHBOARD_SPEC, thinkingLevel: 'low' as const };
    await generateStructuredBrief({ ...base, aiConfig: { provider: 'gemini' } as never });
    expect(state.calls).toEqual([{ tools: undefined, thinkingLevel: 'low' }]);
    state.calls = [];
    state.groundedResult = { ok: false, error: 'thinking_level not supported' };
    const r = await generateStructuredBrief({ ...base, aiConfig: { provider: 'gemini' } as never });
    expect(r).toMatchObject({ model: 'm' });
    expect(state.calls).toEqual([{ tools: undefined, thinkingLevel: 'low' }, { tools: undefined, thinkingLevel: undefined }]);
    state.calls = [];
    await generateStructuredBrief({ ...base, aiConfig: { provider: 'anthropic' } as never });
    expect(state.calls).toEqual([{ tools: undefined, thinkingLevel: undefined }]);
  });
});
