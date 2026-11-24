import { beforeEach, describe, expect, it } from 'vitest';
import { PROVIDERS } from './providerCatalog';
import { clearModelCache, curatedList, listModels, listRequest, mergeModels, parseLiveModels } from './modelList';

const res = (body: unknown, ok = true) => ({ ok, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

describe('parseLiveModels', () => {
  it('reads Gemini, keeping only models that can generate content', () => {
    const raw = parseLiveModels('gemini', { models: [{ name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] }] });
    expect(raw).toEqual([{ id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }]);
  });

  it('reads Anthropic with release dates', () => {
    const raw = parseLiveModels('anthropic', { data: [{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', created_at: '2026-10-01T00:00:00Z' }] });
    expect(raw[0]).toMatchObject({ id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', created: Date.parse('2026-10-01T00:00:00Z') / 1000 });
  });

  it('reads OpenRouter, marking $0 and :free models and tool support, and skipping non-text output', () => {
    const raw = parseLiveModels('openrouter', {
      data: [
        { id: 'a/paid', name: 'Paid', created: 5, pricing: { prompt: '0.000001', completion: '0.000002' }, supported_parameters: ['tools', 'temperature'], architecture: { output_modalities: ['text'] } },
        { id: 'b/zero', name: 'Zero', created: 6, pricing: { prompt: '0', completion: '0' }, supported_parameters: ['temperature'], architecture: { output_modalities: ['text'] } },
        { id: 'c/tagged:free', created: 7, pricing: { prompt: '0.1', completion: '0.1' } },
        { id: 'd/picture', architecture: { output_modalities: ['image'] } },
      ],
    });
    expect(raw.map((m) => [m.id, m.free, m.tools])).toEqual([['a/paid', false, true], ['b/zero', true, false], ['c/tagged:free', true, null]]);
  });

  it('reads OpenAI-style objects and a bare array, and survives junk', () => {
    expect(parseLiveModels('groq', { data: [{ id: 'llama-x', created: 9 }, { nope: 1 }] })).toEqual([{ id: 'llama-x', created: 9 }]);
    expect(parseLiveModels('together', [{ id: 'meta/llama' }])).toEqual([{ id: 'meta/llama' }]);
    expect(parseLiveModels('openai', 'garbage')).toEqual([]);
    expect(parseLiveModels('gemini', null)).toEqual([]);
  });
});

describe('mergeModels', () => {
  const provider = 'groq';
  const curatedIds = PROVIDERS[provider].models.map((m) => m.value);

  it('keeps curated models the account can use, drops a retired one, and adds the rest', () => {
    const raw = [{ id: curatedIds[0] }, { id: 'brand-new-a', created: 300 }, { id: 'brand-new-b', created: 200 }, { id: 'old-c', created: 100 }];
    const out = mergeModels(provider, raw);
    expect(out.source).toBe('live');
    expect(out.models.map((m) => m.value)).toContain(curatedIds[0]);
    expect(out.models.map((m) => m.value)).not.toContain(curatedIds[1]);
    expect(out.models.find((m) => m.value === 'brand-new-a')?.tier).toBe('latest');
    expect(out.models.find((m) => m.value === 'old-c')?.tier).toBe('latest');
  });

  it('puts the newest few in Latest, free ones in Free, and the remainder in Other', () => {
    const raw = Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, created: 100 + i }));
    const out = mergeModels('mistral', [...raw, { id: 'z-free', created: 1, free: true }]);
    const tiers = Object.fromEntries(out.models.filter((m) => m.value.startsWith('m') || m.value === 'z-free').map((m) => [m.value, m.tier]));
    expect(tiers).toMatchObject({ m6: 'latest', m5: 'latest', m4: 'latest', m3: 'latest', m2: 'other', m0: 'other', 'z-free': 'free' });
    expect(out.models.find((m) => m.value === 'z-free')?.free).toBe(true);
  });

  it('leaves out embeddings, speech and moderation models', () => {
    const out = mergeModels('openai', [{ id: 'text-embedding-9' }, { id: 'whisper-2' }, { id: 'omni-moderation-x' }, { id: 'gpt-chat-1', created: 1 }]);
    expect(out.models.map((m) => m.value)).toEqual(['gpt-chat-1']);
  });

  it('falls back to the curated list when nothing usable came back', () => {
    expect(mergeModels('openai', [{ id: 'whisper-1' }])).toEqual(curatedList('openai'));
  });
});

describe('listRequest', () => {
  it('uses a fixed host per provider and sends the key only in the provider header', () => {
    expect(listRequest('gemini', 'K')).toMatchObject({ url: expect.stringContaining('generativelanguage.googleapis.com'), headers: { 'x-goog-api-key': 'K' } });
    expect(listRequest('anthropic', 'K').headers).toMatchObject({ 'x-api-key': 'K' });
    expect(listRequest('openai', 'K')).toEqual({ url: 'https://api.openai.com/v1/models', headers: { authorization: 'Bearer K' } });
    expect(listRequest('groq', 'K').url).toBe('https://api.groq.com/openai/v1/models');
    expect(listRequest('openrouter', 'K').headers).toEqual({});
  });
});

describe('listModels', () => {
  beforeEach(() => clearModelCache());

  it('returns the live list, and caches it for the same key without calling again', async () => {
    let calls = 0;
    const fetchImpl = async () => (calls += 1, res({ data: [{ id: 'live-one', created: 1 }] }));
    const a = await listModels('groq', 'KEY-1', { fetchImpl, now: () => 1000 });
    const b = await listModels('groq', 'KEY-1', { fetchImpl, now: () => 2000 });
    expect(a.source).toBe('live');
    expect(b).toBe(a);
    expect(calls).toBe(1);
    await listModels('groq', 'KEY-2', { fetchImpl, now: () => 2000 });
    expect(calls).toBe(2);
    await listModels('groq', 'KEY-1', { fetchImpl, now: () => 1000 + 6 * 60 * 1000 });
    expect(calls).toBe(3);
  });

  it('falls back to the curated list on an HTTP error, a thrown error, bad JSON and no key', async () => {
    const curated = curatedList('groq');
    expect(await listModels('groq', 'K', { fetchImpl: async () => res({}, false) })).toEqual(curated);
    expect(await listModels('groq', 'K', { fetchImpl: async () => { throw new Error('boom'); } })).toEqual(curated);
    expect(await listModels('groq', 'K', { fetchImpl: async () => res('not json') })).toEqual(curated);
    expect(await listModels('groq', null)).toEqual(curated);
  });

  it('does not need a key for OpenRouter, and never puts the key in the cache key', async () => {
    const fetchImpl = async () => res({ data: [{ id: 'x/free:free', created: 3, pricing: { prompt: '0', completion: '0' } }] });
    const out = await listModels('openrouter', null, { fetchImpl });
    expect(out.source).toBe('live');
    expect(out.models.find((m) => m.value === 'x/free:free')).toMatchObject({ tier: 'free', free: true });
  });
});
