// The models an account can actually use, fetched live from the provider (#333) and merged with the curated list. Curated lists go stale and
// cannot cover everything an account can use; a failure always falls back to the curated list, so the picker never ends up empty.
//
// Security: every listing URL is fixed here (or in the catalogue), never taken from the request, and the key is only ever sent to that
// provider. It is not logged, cached in the clear or put in an error message.

import { curatedList, fromCatalog, type ModelListResult, type PickerModel } from './pickerModels';
import { PROVIDERS, type AiProvider } from './providerCatalog';

export { curatedList };
export type { ModelListResult, PickerModel };

export interface RawModel {
  readonly id: string;
  readonly label?: string;
  /** Unix seconds, when the provider says when the model was released. */
  readonly created?: number;
  readonly free?: boolean;
  readonly tools?: boolean | null;
}

/** How many of the newest live-only models are shown as "Latest". */
const LATEST_LIVE_COUNT = 4;
const FETCH_TIMEOUT_MS = 8000;
const MAX_RESPONSE_CHARS = 3_000_000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 100;

/** Models that do not chat: embeddings, speech, images, moderation, rerankers. */
const NON_CHAT = /embed|whisper|tts|dall-e|image|moderation|rerank|transcribe|realtime|speech|audio|guard|babbage|davinci|ocr/i;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

function unixOf(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

/** Reads a provider's listing response into raw models. Anything unexpected yields fewer models, never an exception. */
export function parseLiveModels(provider: AiProvider, json: unknown): RawModel[] {
  const out: RawModel[] = [];
  if (provider === 'gemini') {
    const list = isRecord(json) && Array.isArray(json.models) ? json.models : [];
    for (const m of list) {
      if (!isRecord(m)) continue;
      const id = str(m.name)?.replace(/^models\//, '');
      const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      if (id && methods.includes('generateContent')) out.push({ id, label: str(m.displayName) });
    }
    return out;
  }
  if (provider === 'anthropic') {
    const list = isRecord(json) && Array.isArray(json.data) ? json.data : [];
    for (const m of list) {
      if (isRecord(m) && str(m.id)) out.push({ id: str(m.id)!, label: str(m.display_name), created: unixOf(m.created_at) });
    }
    return out;
  }
  if (provider === 'openrouter') {
    const list = isRecord(json) && Array.isArray(json.data) ? json.data : [];
    for (const m of list) {
      if (!isRecord(m) || !str(m.id)) continue;
      const arch = isRecord(m.architecture) ? m.architecture : {};
      const outputs = Array.isArray(arch.output_modalities) ? arch.output_modalities : ['text'];
      if (!outputs.includes('text')) continue;
      const pricing = isRecord(m.pricing) ? m.pricing : {};
      const free = (Number(pricing.prompt) === 0 && Number(pricing.completion) === 0) || str(m.id)!.endsWith(':free');
      const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : null;
      out.push({ id: str(m.id)!, label: str(m.name), created: num(m.created), free, tools: params ? params.includes('tools') : null });
    }
    return out;
  }
  // OpenAI-style: { data: [{ id, created }] }, or a bare array (Together).
  const list = Array.isArray(json) ? json : isRecord(json) && Array.isArray(json.data) ? json.data : [];
  for (const m of list) {
    if (isRecord(m) && str(m.id)) out.push({ id: str(m.id)!, created: num(m.created) });
  }
  return out;
}

const byNewest = (a: RawModel, b: RawModel) => (b.created ?? 0) - (a.created ?? 0) || a.id.localeCompare(b.id);

/**
 * The picker list for an account: the curated models the account can actually use (a retired ID is dropped), then the other chat models
 * it can see, the newest few as Latest, free ones as Free, the rest as Other. Falls back to the curated list when nothing usable came back.
 */
export function mergeModels(provider: AiProvider, raw: readonly RawModel[]): ModelListResult {
  const chat = raw.filter((m) => !NON_CHAT.test(m.id));
  if (chat.length === 0) return curatedList(provider);
  const live = new Map(chat.map((m) => [m.id, m]));
  const curated = PROVIDERS[provider].models.filter((m) => live.has(m.value)).map((m) => fromCatalog(m, live.get(m.value)?.tools ?? null));
  const known = new Set(curated.map((m) => m.value));
  const extra = chat.filter((m) => !known.has(m.id)).sort(byNewest);
  const hasDates = extra.some((m) => m.created !== undefined);
  const latestIds = new Set(hasDates ? extra.filter((m) => !m.free).slice(0, LATEST_LIVE_COUNT).map((m) => m.id) : []);
  const added: PickerModel[] = extra.map((m) => ({
    value: m.id,
    label: m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id,
    tier: m.free ? 'free' : latestIds.has(m.id) ? 'latest' : 'other',
    free: m.free === true,
    tools: m.tools ?? null,
  }));
  return { source: 'live', models: [...curated, ...added] };
}

/** The fixed listing request for a provider. The key goes only to the provider's own host. */
export function listRequest(provider: AiProvider, apiKey: string): { url: string; headers: Record<string, string> } {
  const info = PROVIDERS[provider];
  switch (info.sdk) {
    case 'gemini':
      return { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', headers: { 'x-goog-api-key': apiKey } };
    case 'anthropic':
      return { url: 'https://api.anthropic.com/v1/models?limit=100', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } };
    case 'openrouter':
      // OpenRouter's list is public and carries the pricing that marks free models, so no key is sent.
      return { url: 'https://openrouter.ai/api/v1/models', headers: {} };
    case 'openai':
      return { url: 'https://api.openai.com/v1/models', headers: { authorization: `Bearer ${apiKey}` } };
    case 'compatible':
      return { url: `${info.baseUrl}/models`, headers: { authorization: `Bearer ${apiKey}` } };
  }
}

type FetchLike = (url: string, init: { headers: Record<string, string>; signal: AbortSignal; cache: 'no-store' }) => Promise<Pick<Response, 'ok' | 'text'>>;

const cache = new Map<string, { at: number; result: ModelListResult }>();

/**
 * Cached per user and provider, so the key is never hashed or stored: nothing derived from it is kept. The trade-off is that for the
 * cache lifetime a different key for the same provider gets the list fetched with the previous one, which differs only in account-specific
 * models. OpenRouter's list is public and shared.
 */
const cacheKey = (provider: AiProvider, scope: string): string => (provider === 'openrouter' ? 'openrouter:public' : `${provider}:${scope}`);

export function clearModelCache(): void {
  cache.clear();
}

/** Live models for the key, merged with the curated list. `scope` (the user id) only keys the cache. Never throws: any failure returns the curated list. */
export async function listModels(provider: AiProvider, apiKey: string | null, scope: string, deps: { fetchImpl?: FetchLike; now?: () => number } = {}): Promise<ModelListResult> {
  const needsKey = PROVIDERS[provider].sdk !== 'openrouter';
  if (needsKey && !apiKey) return curatedList(provider);
  const key = apiKey ?? '';
  const now = (deps.now ?? Date.now)();
  const ck = cacheKey(provider, scope);
  const hit = cache.get(ck);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.result;
  try {
    const { url, headers } = listRequest(provider, key);
    const res = await (deps.fetchImpl ?? (fetch as FetchLike))(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: 'no-store' });
    if (!res.ok) return curatedList(provider);
    const text = await res.text();
    if (text.length > MAX_RESPONSE_CHARS) return curatedList(provider);
    const result = mergeModels(provider, parseLiveModels(provider, JSON.parse(text)));
    if (result.source === 'live') {
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(ck, { at: now, result });
    }
    return result;
  } catch {
    // Network error, timeout, bad JSON: the curated list is the answer. Nothing about the request is logged.
    return curatedList(provider);
  }
}
