import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_IDS, PROVIDERS, groupedModels, isAiProvider } from './providerCatalog';
import { MODEL_OPTIONS, isValidModelId, resolveModel } from './providers';

describe('provider catalog', () => {
  it('offers eleven providers, each keyed by its own id', () => {
    expect(AI_PROVIDER_IDS).toHaveLength(11);
    for (const id of AI_PROVIDER_IDS) expect(PROVIDERS[id].id).toBe(id);
  });

  it.each(AI_PROVIDER_IDS)('%s has a valid default, key link, hint and unique valid model ids', (id) => {
    const info = PROVIDERS[id];
    expect(isValidModelId(info.defaultModel) && info.defaultModel.length > 0).toBe(true);
    expect(info.keyUrl).toMatch(/^https:\/\//);
    expect(info.keyHint.length).toBeGreaterThan(10);
    const values = info.models.map((m) => m.value);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(isValidModelId(v) && v.length > 0).toBe(true);
    expect(info.models.some((m) => m.tier === 'latest' || m.tier === 'free')).toBe(true);
  });

  it('gives every OpenAI-style provider a fixed https base URL, and only those', () => {
    for (const id of AI_PROVIDER_IDS) {
      const { sdk, baseUrl } = PROVIDERS[id];
      if (sdk === 'compatible') expect(baseUrl).toMatch(/^https:\/\/[a-z0-9.-]+\/[\w/]*v1$/);
      else expect(baseUrl).toBeUndefined();
    }
  });

  it('lists a free model for the providers known to have a free tier', () => {
    for (const id of ['openrouter', 'groq', 'cerebras', 'gemini'] as const) {
      expect(PROVIDERS[id].models.some((m) => m.tier === 'free')).toBe(true);
    }
  });

  it('groups models Latest, Free, Other and leaves empty groups out', () => {
    for (const id of AI_PROVIDER_IDS) {
      const groups = groupedModels(id);
      expect(groups.flatMap((g) => g.models)).toHaveLength(PROVIDERS[id].models.length);
      const order = groups.map((g) => g.tier);
      expect(order).toEqual(['latest', 'free', 'other'].filter((t) => order.includes(t as never)));
      for (const g of groups) expect(g.models.length).toBeGreaterThan(0);
    }
  });

  it('isAiProvider accepts only known ids', () => {
    expect(isAiProvider('groq')).toBe(true);
    expect(isAiProvider('nope')).toBe(false);
    expect(isAiProvider(undefined)).toBe(false);
  });

  it.each(AI_PROVIDER_IDS)('builds a model for %s without any network call', (id) => {
    const m = resolveModel({ provider: id, apiKey: 'test-key', model: null });
    expect((m as { modelId?: string }).modelId).toBe(PROVIDERS[id].defaultModel);
    expect(MODEL_OPTIONS[id][0].value).toBe('');
  });

  it('keeps public/openapi.json and the settings route in step with the catalog', () => {
    const openapi = JSON.parse(readFileSync('public/openapi.json', 'utf8'));
    const schema = openapi.paths['/api/settings/ai'].put.requestBody.content['application/json'].schema;
    expect([...schema.properties.provider.enum].sort()).toEqual([...AI_PROVIDER_IDS].sort());
  });
});
