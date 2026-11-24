import { describe, expect, it } from 'vitest';
import { AI_PROVIDER_IDS } from './providerCatalog';
import { DEFAULT_MODELS, MAX_MODEL_ID_LENGTH, MODEL_OPTIONS, PROVIDER_LABELS, isValidModelId, resolveModel } from './providers';

describe('providers', () => {
  it('has a default model + label for each provider', () => {
    for (const p of AI_PROVIDER_IDS) {
      expect(DEFAULT_MODELS[p]).toBeTruthy();
      expect(PROVIDER_LABELS[p]).toBeTruthy();
    }
  });

  it('has a curated model dropdown for each provider, starting with a default option', () => {
    for (const p of AI_PROVIDER_IDS) {
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
    for (const provider of AI_PROVIDER_IDS) {
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

describe('isValidModelId', () => {
  it.each(['', 'gemini-3.8-flash', 'google/gemma-4-31b-it:free', 'anthropic/claude-haiku-5.5', 'claude_opus-5-5'])('accepts %j', (id) => {
    expect(isValidModelId(id)).toBe(true);
  });

  it.each(['has space', 'bad?query=1', '../etc/passwd', 'a/../b', 'semi;colon', 'new\nline', 'ünïcode', '<script>'])('rejects %j', (id) => {
    expect(isValidModelId(id)).toBe(false);
  });

  it('rejects an id longer than the limit', () => {
    expect(isValidModelId('a'.repeat(MAX_MODEL_ID_LENGTH))).toBe(true);
    expect(isValidModelId('a'.repeat(MAX_MODEL_ID_LENGTH + 1))).toBe(false);
  });

  it('accepts every curated model option', () => {
    for (const options of Object.values(MODEL_OPTIONS)) for (const o of options) expect(isValidModelId(o.value)).toBe(true);
  });
});
