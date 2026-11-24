// The one list of AI providers a user can bring a key for (#332, ADR 0079). Plain data with no SDK imports, so settings and onboarding
// can read it in the browser without bundling the provider SDKs. Everything else (route enum, env fallback, labels, dropdowns, key links)
// derives from this file; a test checks the openapi enum against it.
//
// MAINTENANCE: model IDs change faster than this file does, and a stale ID breaks "Test & save". Review at least every 8-12 weeks; the
// live model list (#333) covers the gap in between. Sources used on LAST_REVIEWED are named per provider below.

export const AI_PROVIDER_IDS = [
  'gemini',
  'anthropic',
  'openrouter',
  'openai',
  'groq',
  'mistral',
  'deepseek',
  'xai',
  'together',
  'cerebras',
  'sarvam',
] as const;

export type AiProvider = (typeof AI_PROVIDER_IDS)[number];

/** `latest` = newest flagship picks, `free` = usable without paying (a $0 model or a free tier), `other` = everything else we list. */
export type ModelTier = 'latest' | 'free' | 'other';

/** Which AI SDK package builds the model. `compatible` is any OpenAI-style endpoint with a fixed base URL. */
export type SdkKind = 'gemini' | 'anthropic' | 'openrouter' | 'openai' | 'compatible';

export interface CatalogModel {
  readonly value: string;
  readonly label: string;
  readonly tier: ModelTier;
}

export interface ProviderInfo {
  readonly id: AiProvider;
  readonly label: string;
  readonly sdk: SdkKind;
  /** Base URL for `compatible` providers. Fixed here, never user-supplied. */
  readonly baseUrl?: string;
  readonly defaultModel: string;
  readonly keyHint: string;
  readonly keyUrl: string;
  /** Whether the provider's models are known to read images and PDFs. Text attachments work everywhere. */
  readonly files: boolean;
  readonly models: readonly CatalogModel[];
}

export const MODELS_LAST_REVIEWED = '2026-11-24';

export const PROVIDERS: Readonly<Record<AiProvider, ProviderInfo>> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    sdk: 'gemini',
    defaultModel: 'gemini-3.8-flash',
    keyHint: 'From aistudio.google.com/apikey. Has a free tier.',
    keyUrl: 'https://aistudio.google.com/apikey',
    files: true,
    models: [
      { value: 'gemini-4-argon', label: 'Gemini 4 Argon — most capable, flagship reasoning', tier: 'latest' },
      { value: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash — flagship, agentic/coding', tier: 'latest' },
      { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — fastest, cheapest', tier: 'free' },
      { value: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview) — deep reasoning', tier: 'other' },
    ],
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    sdk: 'anthropic',
    defaultModel: 'claude-haiku-5-5',
    keyHint: 'From console.anthropic.com. Pay as you go.',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    files: true,
    models: [
      { value: 'claude-fable-5-2', label: 'Claude Fable 5.2 — most capable, flagship reasoning', tier: 'latest' },
      { value: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 — balanced', tier: 'latest' },
      { value: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 — fastest, cheapest', tier: 'latest' },
      { value: 'claude-opus-5-5', label: 'Claude Opus 5.5 — advanced agentic coding', tier: 'other' },
      { value: 'claude-fable-5-1', label: 'Claude Fable 5.1', tier: 'other' },
    ],
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    sdk: 'openrouter',
    defaultModel: 'google/gemini-3.8-flash',
    keyHint: 'From openrouter.ai/keys. Routes to many models, including free ones.',
    keyUrl: 'https://openrouter.ai/keys',
    files: true,
    models: [
      { value: 'openai/gpt-6.2-astra', label: 'OpenAI GPT-6.2 Astra', tier: 'latest' },
      { value: 'anthropic/claude-fable-5.2', label: 'Anthropic Claude Fable 5.2', tier: 'latest' },
      { value: 'x-ai/grok-4.7', label: 'xAI Grok 4.7', tier: 'latest' },
      { value: 'google/gemini-3.8-flash', label: 'Google Gemini 3.8 Flash', tier: 'latest' },
      { value: 'google/gemma-4-31b-it:free', label: 'Google Gemma 4 31B (free)', tier: 'free' },
      { value: 'google/gemma-4-26b-a4b-it:free', label: 'Google Gemma 4 26B A4B (free)', tier: 'free' },
      { value: 'nvidia/nemotron-3-ultra-550b-a55b:free', label: 'NVIDIA Nemotron 3 Ultra 550B (free)', tier: 'free' },
      { value: 'nvidia/nemotron-3.5-super-vl:free', label: 'NVIDIA Nemotron 3.5 Super VL (free)', tier: 'free' },
      { value: 'nvidia/nemotron-3.5-lightning:free', label: 'NVIDIA Nemotron 3.5 Lightning (free)', tier: 'free' },
      { value: 'inclusionai/ling-3.2-flash:free', label: 'InclusionAI Ling 3.2 Flash (free)', tier: 'free' },
      { value: 'openai/gpt-6.2-sol', label: 'OpenAI GPT-6.2 Sol', tier: 'other' },
      { value: 'anthropic/claude-sonnet-5.5', label: 'Anthropic Claude Sonnet 5.5', tier: 'other' },
      { value: 'anthropic/claude-haiku-5.5', label: 'Anthropic Claude Haiku 5.5', tier: 'other' },
      { value: 'deepseek/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash', tier: 'other' },
      { value: 'mistralai/mistral-large-4-0', label: 'Mistral Large 4', tier: 'other' },
      { value: 'google/gemini-3.5-flash-lite', label: 'Google Gemini 3.5 Flash-Lite', tier: 'other' },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    sdk: 'openai',
    defaultModel: 'gpt-6.2-sol',
    keyHint: 'From platform.openai.com/api-keys. Pay as you go.',
    keyUrl: 'https://platform.openai.com/api-keys',
    files: true,
    models: [
      { value: 'gpt-6.2-astra', label: 'GPT-6.2 Astra — most capable, complex reasoning and coding', tier: 'latest' },
      { value: 'gpt-6.2-sol', label: 'GPT-6.2 Sol — balanced, coding and agents', tier: 'latest' },
      { value: 'gpt-6.1-terra', label: 'GPT-6.1 Terra — fast, visual reasoning', tier: 'other' },
      { value: 'gpt-6-luna', label: 'GPT-6 Luna — most efficient, high volume', tier: 'other' },
    ],
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    sdk: 'compatible',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    keyHint: 'From console.groq.com/keys. Has a free tier, very fast.',
    keyUrl: 'https://console.groq.com/keys',
    files: false,
    models: [
      { value: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B', tier: 'free' },
      { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', tier: 'free' },
      { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B', tier: 'free' },
      { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant — fastest', tier: 'free' },
      { value: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B (preview)', tier: 'other' },
      { value: 'minimaxai/minimax-m2.7', label: 'MiniMax M2.7 (preview)', tier: 'other' },
    ],
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral',
    sdk: 'compatible',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-small-latest',
    keyHint: 'From console.mistral.ai/api-keys. Has a free experiment tier.',
    keyUrl: 'https://console.mistral.ai/api-keys',
    files: true,
    models: [
      { value: 'mistral-large-latest', label: 'Mistral Large (latest) — most capable', tier: 'latest' },
      { value: 'mistral-small-latest', label: 'Mistral Small (latest) — fast, cheap', tier: 'latest' },
      { value: 'ministral-8b-latest', label: 'Ministral 8B (latest) — small and cheap', tier: 'other' },
    ],
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    sdk: 'compatible',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-flash',
    keyHint: 'From platform.deepseek.com/api_keys. Very low cost.',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    files: false,
    models: [
      { value: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro — most capable', tier: 'latest' },
      { value: 'deepseek-flash', label: 'DeepSeek V4.1 Flash — fast, cheap', tier: 'latest' },
    ],
  },
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    sdk: 'compatible',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.7',
    keyHint: 'From console.x.ai. Pay as you go.',
    keyUrl: 'https://console.x.ai',
    files: true,
    models: [
      { value: 'grok-4.7', label: 'Grok 4.7', tier: 'latest' },
      { value: 'grok-4.6', label: 'Grok 4.6', tier: 'latest' },
      { value: 'grok-4.5', label: 'Grok 4.5', tier: 'other' },
      { value: 'grok-4.3', label: 'Grok 4.3 — 1M context', tier: 'other' },
      { value: 'grok-4.20-0309-reasoning', label: 'Grok 4.20 reasoning — 1M context', tier: 'other' },
      { value: 'grok-4.20-0309-non-reasoning', label: 'Grok 4.20 non-reasoning — 1M context', tier: 'other' },
    ],
  },
  together: {
    id: 'together',
    label: 'Together AI',
    sdk: 'compatible',
    baseUrl: 'https://api.together.ai/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
    keyHint: 'From api.together.ai/settings/api-keys. Many open models.',
    keyUrl: 'https://api.together.ai/settings/api-keys',
    files: false,
    models: [
      { value: 'moonshotai/Kimi-K3.1-Pro', label: 'Kimi K3.1 Pro', tier: 'latest' },
      { value: 'deepseek-ai/DeepSeek-V4-Pro-0813', label: 'DeepSeek V4 Pro', tier: 'latest' },
      { value: 'deepseek-ai/DeepSeek-V4.1-Flash-1017', label: 'DeepSeek V4.1 Flash', tier: 'latest' },
      { value: 'zai-org/GLM-5.3', label: 'GLM 5.3', tier: 'latest' },
      { value: 'Prism-ML/Ternary-Bonsai-27B', label: 'Ternary Bonsai 27B (free)', tier: 'free' },
      { value: 'Qwen/Qwen4-Max', label: 'Qwen 4 Max', tier: 'other' },
      { value: 'Qwen/Qwen3.8-Flash', label: 'Qwen 3.8 Flash', tier: 'other' },
      { value: 'moonshotai/Kimi-K3', label: 'Kimi K3', tier: 'other' },
      { value: 'MiniMaxAI/MiniMax-M3.1-Flash', label: 'MiniMax M3.1 Flash', tier: 'other' },
    ],
  },
  sarvam: {
    id: 'sarvam',
    label: 'Sarvam AI',
    sdk: 'compatible',
    baseUrl: 'https://api.sarvam.ai/v1',
    defaultModel: 'sarvam-105b',
    keyHint: 'From indus.sarvam.ai (API Keys). Made in India, strong on Indian languages.',
    keyUrl: 'https://indus.sarvam.ai/key-management',
    files: false,
    models: [
      { value: 'sarvam-105b', label: 'Sarvam 105B — flagship, reasoning and coding (128K)', tier: 'latest' },
      { value: 'sarvam-105b-conversations', label: 'Sarvam 105B Conversations — fast replies (32K)', tier: 'other' },
    ],
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    sdk: 'compatible',
    baseUrl: 'https://api.cerebras.ai/v1',
    defaultModel: 'gpt-oss-120b',
    keyHint: 'From cloud.cerebras.ai. Has a free tier, very fast.',
    keyUrl: 'https://cloud.cerebras.ai',
    files: false,
    models: [
      { value: 'gpt-oss-120b', label: 'GPT-OSS 120B (free tier)', tier: 'free' },
      { value: 'qwen-3.8-27b', label: 'Qwen 3.8 27B (free tier)', tier: 'free' },
      { value: 'kimi-k3.1-pro', label: 'Kimi K3.1 Pro', tier: 'latest' },
      { value: 'kimi-k3', label: 'Kimi K3', tier: 'other' },
      { value: 'zai-glm-5.3-flash', label: 'GLM 5.3 Flash', tier: 'other' },
      { value: 'gemma-4-31b', label: 'Gemma 4 31B', tier: 'other' },
    ],
  },
};

const TIER_ORDER: readonly ModelTier[] = ['latest', 'free', 'other'];
export const TIER_LABELS: Readonly<Record<ModelTier, string>> = {
  latest: 'Latest',
  free: 'Free',
  other: 'Other models',
};

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}

/** A provider's models in Latest, Free, Other order, empty groups left out. Pure, so the dropdowns share one grouping. */
export function groupedModels(provider: AiProvider): { readonly tier: ModelTier; readonly label: string; readonly models: readonly CatalogModel[] }[] {
  const { models } = PROVIDERS[provider];
  return TIER_ORDER.map((tier) => ({ tier, label: TIER_LABELS[tier], models: models.filter((m) => m.tier === tier) })).filter((g) => g.models.length > 0);
}
