import { describe, expect, it, vi } from 'vitest';
import type { AiConfig } from '../providers';
import { nativeSearchTools, withSearchFallback } from './searchTools';

const budget = { maxSearches: 5, maxPages: 3 };
const config = (provider: AiConfig['provider']): AiConfig => ({ provider, apiKey: 'test-key', model: null });

describe('nativeSearchTools', () => {
  it('gives the three providers that have one their own search', () => {
    expect(Object.keys(nativeSearchTools(config('gemini'), budget) ?? {})).toEqual(['google_search']);
    expect(Object.keys(nativeSearchTools(config('anthropic'), budget) ?? {})).toEqual(['web_search']);
    expect(Object.keys(nativeSearchTools(config('openai'), budget) ?? {})).toEqual(['web_search']);
  });
  it.each(['openrouter', 'groq', 'mistral', 'deepseek', 'together', 'cerebras'] as const)('gives %s none, so it uses the keyless tools', (provider) => {
    expect(nativeSearchTools(config(provider), budget)).toBeNull();
  });
});

describe('withSearchFallback', () => {
  type Reply = { ok: boolean; text?: string; error?: string };
  const ok: Reply = { ok: true, text: 'answer' };
  const fail: Reply = { ok: false, error: 'search not enabled' };

  it('uses the native attempt when it works, and never runs the keyless one', async () => {
    const keyless = vi.fn(async () => ok);
    const out = await withSearchFallback(async () => ok, keyless);
    expect(out.mode).toBe('native');
    expect(keyless).not.toHaveBeenCalled();
  });
  it('falls back to the keyless attempt when the native one fails', async () => {
    const out = await withSearchFallback(async () => fail, async () => ok);
    expect(out).toEqual({ mode: 'keyless', result: ok });
  });
  it('goes straight to keyless with no native tools, and reports its failure as the failure', async () => {
    const out = await withSearchFallback(null, async () => fail);
    expect(out).toEqual({ mode: 'keyless', result: fail });
  });
});
