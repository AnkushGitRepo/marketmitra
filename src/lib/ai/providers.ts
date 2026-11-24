import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel, ToolSet } from 'ai';
import { AI_PROVIDER_IDS, MODELS_LAST_REVIEWED, PROVIDERS, type AiProvider, type ModelTier } from './providerCatalog';

// The provider and model lists live in providerCatalog.ts (#332, ADR 0079); this file builds models from them and keeps the
// long-standing exports (defaults, labels, dropdown options) as views of that one list. Review policy and sources are in the catalog.
export { MODELS_LAST_REVIEWED };

const entries = <T,>(pick: (id: AiProvider) => T): Record<AiProvider, T> =>
  Object.fromEntries(AI_PROVIDER_IDS.map((id) => [id, pick(id)])) as Record<AiProvider, T>;

// Defaults used when the user leaves the model field on "Default".
export const DEFAULT_MODELS: Record<AiProvider, string> = entries((id) => PROVIDERS[id].defaultModel);

export const PROVIDER_LABELS: Record<AiProvider, string> = entries((id) => PROVIDERS[id].label);

export const MAX_MODEL_ID_LENGTH = 120;

/**
 * Model ids end up in provider request URLs, so only id-like characters are allowed (letters, digits, . _ : / -) and no path traversal.
 * One rule for the server (PUT /api/settings/ai) and the forms, so they cannot drift. Empty means "use the provider's default".
 */
export function isValidModelId(model: string): boolean {
  return model.length <= MAX_MODEL_ID_LENGTH && /^[A-Za-z0-9._:/-]*$/.test(model) && !model.includes('..');
}

export interface ModelOption {
  /** Empty string means "use the provider's current default". */
  value: string;
  label: string;
  /** Absent on the "Default" entry. */
  tier?: ModelTier;
}

// Picks shown in the settings dropdowns: the provider's default first, then the catalog's models. The UI adds its own
// "Other (custom)" option for anything not listed, so an omission is never a dead end for the user.
export const MODEL_OPTIONS: Record<AiProvider, ModelOption[]> = entries((id) => [
  { value: '', label: `Default (${PROVIDERS[id].defaultModel})` },
  ...PROVIDERS[id].models.map((m) => ({ value: m.value, label: m.label, tier: m.tier })),
]);

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string | null;
}

/** Build a LanguageModel from a resolved BYO config. */
export function resolveModel(config: AiConfig): LanguageModel {
  const model = config.model?.trim() || DEFAULT_MODELS[config.provider];
  const info = PROVIDERS[config.provider];
  switch (info.sdk) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(model);
    case 'anthropic':
      return createAnthropic({ apiKey: config.apiKey })(model);
    case 'openrouter':
      return createOpenRouter({ apiKey: config.apiKey })(model);
    case 'openai':
      return createOpenAI({ apiKey: config.apiKey })(model);
    case 'compatible':
      return createOpenAICompatible({ name: info.id, apiKey: config.apiKey, baseURL: info.baseUrl ?? '' })(model);
  }
}

/**
 * Web-search tools for one grounded call. Only Gemini has a provider-run search tool here (Google Search grounding, free with the user's own
 * key); the other providers answer from the prompt and the retrieved passages, so they get none.
 */
export function groundingTools(config: AiConfig): ToolSet | undefined {
  if (config.provider !== 'gemini') return undefined;
  return { google_search: createGoogleGenerativeAI({ apiKey: config.apiKey }).tools.googleSearch({}) };
}
