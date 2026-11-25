// Which web-search tools a research call gets (#364): the provider's own search where the user's key has one (it runs
// on the provider's side, with no extra setup), else our keyless `web_search` + `fetch_page`.

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { ToolSet } from 'ai';
import { groundingTools, type AiConfig } from '../providers';
import { PROVIDERS } from '../providerCatalog';
import type { SearchBudget } from './webTools';

export type SearchMode = 'native' | 'keyless';

/** The provider's own search tool, or null for a provider without one (Groq, Mistral, DeepSeek, OpenRouter and the rest). */
export function nativeSearchTools(config: AiConfig, budget: SearchBudget): ToolSet | null {
  switch (PROVIDERS[config.provider].sdk) {
    case 'gemini':
      return groundingTools(config) ?? null;
    case 'anthropic':
      return { web_search: createAnthropic({ apiKey: config.apiKey }).tools.webSearch_20250305({ maxUses: budget.maxSearches }) };
    case 'openai':
      // The SDK types this tool's (empty) input schema more narrowly than a ToolSet entry; the provider runs it, we never call it.
      return { web_search: createOpenAI({ apiKey: config.apiKey }).tools.webSearch({}) as unknown as ToolSet[string] };
    default:
      return null;
  }
}

export interface Attempt<T> {
  readonly mode: SearchMode;
  readonly result: T;
}

/**
 * Runs the native attempt when there is one and falls back to the keyless one if it fails (a provider's search can be switched
 * off for an account, or not offered for a model). The keyless attempt is the last one: its failure is the failure.
 */
export async function withSearchFallback<T extends { ok: boolean }>(native: (() => Promise<T>) | null, keyless: () => Promise<T>): Promise<Attempt<T>> {
  if (native) {
    const first = await native();
    if (first.ok) return { mode: 'native', result: first };
  }
  return { mode: 'keyless', result: await keyless() };
}
