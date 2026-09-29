import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModel } from 'ai';
import type { AiProvider } from '@/lib/userSettings';

// --- Model lists ---------------------------------------------------------
//
// Providers retire/rename model IDs faster than this file gets touched
// (Google alone has done it twice: 2.5-flash -> 3.6-flash -> 3.8-flash).
// A stale ID here doesn't just look outdated, it actively breaks the AI
// features for every BYO-key user until someone notices and fixes it.
//
// MAINTENANCE POLICY: review this file at least every 8-12 weeks (a
// recurring reminder is scheduled for this — see docs/decisions/, the ADR
// for this file's dropdown UI). To review:
//   1. Gemini:     https://ai.google.dev/gemini-api/docs/models
//   2. Anthropic:  https://platform.claude.com/docs/en/about-claude/models/overview
//   3. OpenRouter: https://openrouter.ai/models (search "claude" / "gemini")
//   Update DEFAULT_MODELS + MODEL_OPTIONS below, bump LAST_REVIEWED, run
//   `npm run test -- --run src/lib/ai`, and — since a wrong model ID here
//   silently breaks the "Test & save" flow for real users — actually test
//   the settings page against a real key for at least the gemini provider
//   before shipping.
//
// LAST_REVIEWED: 2026-09-29 (sourced from the docs pages above on that
// date; exact model IDs past this date are not independently verified —
// re-check them, don't just trust this comment).
export const MODELS_LAST_REVIEWED = '2026-09-29';

// Defaults used when the user leaves the model field on "Default".
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  gemini: 'gemini-3.8-flash',
  anthropic: 'claude-haiku-4-5-20251001',
  openrouter: 'google/gemini-3.8-flash',
};

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
  openrouter: 'OpenRouter',
};

export interface ModelOption {
  /** Empty string means "use the provider's current default". */
  value: string;
  label: string;
}

// Curated per-provider picks shown in the settings dropdown, roughly
// fast/cheap -> balanced -> most-capable. Kept short on purpose — this is
// a pick list for people who don't want to think about it, not the full
// catalog. The UI adds its own "Other (custom)" option for anything not
// listed here, so an omission is never a dead end for the user.
export const MODEL_OPTIONS: Record<AiProvider, ModelOption[]> = {
  gemini: [
    { value: '', label: `Default (${DEFAULT_MODELS.gemini})` },
    { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — fastest, cheapest' },
    { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — flagship, agentic/coding' },
    { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview) — deepest reasoning' },
  ],
  anthropic: [
    { value: '', label: `Default (${DEFAULT_MODELS.anthropic})` },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 — fastest, cheapest' },
    { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — balanced' },
    { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 — most capable' },
  ],
  openrouter: [
    { value: '', label: `Default (${DEFAULT_MODELS.openrouter})` },
    { value: 'google/gemini-3.5-flash-lite', label: 'Google Gemini 3.5 Flash-Lite' },
    { value: 'google/gemini-3.8-flash', label: 'Google Gemini 3.8 Flash' },
    { value: 'anthropic/claude-haiku-4.5', label: 'Anthropic Claude Haiku 4.5' },
    { value: 'anthropic/claude-sonnet-5.5', label: 'Anthropic Claude Sonnet 5.5' },
  ],
};

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string | null;
}

/** Build a LanguageModel from a resolved BYO config. */
export function resolveModel(config: AiConfig): LanguageModel {
  const model = config.model?.trim() || DEFAULT_MODELS[config.provider];
  switch (config.provider) {
    case 'gemini':
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(model);
    case 'anthropic':
      return createAnthropic({ apiKey: config.apiKey })(model);
    case 'openrouter':
      return createOpenRouter({ apiKey: config.apiKey })(model);
  }
}
