import { describe, expect, it } from 'vitest';
import { DEFAULT_MODELS, MODEL_OPTIONS, PROVIDER_LABELS, resolveModel } from './providers';

describe('providers', () => {
  it('has a default model + label for each provider', () => {
    for (const p of ['gemini', 'anthropic', 'openrouter'] as const) {
      expect(DEFAULT_MODELS[p]).toBeTruthy();
      expect(PROVIDER_LABELS[p]).toBeTruthy();
    }
  });

  it('has a curated model dropdown for each provider, starting with a default option', () => {
    for (const p of ['gemini', 'anthropic', 'openrouter'] as const) {
      const options = MODEL_OPTIONS[p];
      expect(options.length).toBeGreaterThan(0);
      expect(options[0].value).toBe('');
      expect(options[0].label).toContain(DEFAULT_MODELS[p]);
      // every non-default option should be a real, resolvable model id
      for (const opt of options.slice(1)) {
        expect(opt.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('resolveModel builds a LanguageModel for each provider (no network)', () => {
    for (const provider of ['gemini', 'anthropic', 'openrouter'] as const) {
      const m = resolveModel({ provider, apiKey: 'test-key', model: null });
      expect(m).toBeTruthy();
      // AI SDK model objects expose a modelId
      expect(typeof (m as { modelId?: string }).modelId).toBe('string');
    }
  });

  it('honours an explicit model override', () => {
    const m = resolveModel({ provider: 'gemini', apiKey: 'k', model: 'gemini-2.5-pro' });
    expect((m as { modelId?: string }).modelId).toBe('gemini-2.5-pro');
  });
});
