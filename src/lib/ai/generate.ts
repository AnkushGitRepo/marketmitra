import { generateText, stepCountIs, streamText, type ModelMessage, type ToolSet } from 'ai';
import { resolveModel, type AiConfig } from './providers';

export interface GenerateResult {
  ok: true;
  text: string;
  model: string;
}

export interface GenerateError {
  ok: false;
  error: string;
}

// Gemini 2.5 / 3.x are "thinking" models — a small output budget can be
// spent entirely on hidden reasoning tokens, leaving zero visible text.
// Keep this comfortably above the reasoning overhead.
const MAX_OUTPUT_TOKENS = 2048;

/**
 * One non-streaming text generation. Never throws — provider/auth errors
 * (bad key, quota, model not found) come back as `{ ok: false, error }`
 * so route handlers can return a clean 4xx/5xx. The error string carries
 * the provider's own message when it's short enough to be useful.
 */
export async function generateInsightText(
  config: AiConfig,
  system: string,
  prompt: string,
  opts: { maxOutputTokens?: number } = {}
): Promise<GenerateResult | GenerateError> {
  try {
    const model = resolveModel(config);
    const { text, finishReason } = await generateText({
      model,
      system,
      prompt,
      temperature: 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
    });
    const clean = text.trim();
    if (!clean) {
      return {
        ok: false,
        error: `The model returned no text (finish reason: ${finishReason}). Try a different model.`,
      };
    }
    return { ok: true, text: clean, model: config.model?.trim() || `${config.provider} (default)` };
  } catch (err) {
    console.error('[ai] generation failed:', err);
    return { ok: false, error: normalizeAiError(err) };
  }
}

export interface StreamChatOptions {
  /** When set, the model runs a tool-calling loop with these tools
   *  (Phase 10 / ADR 0020). `maxSteps` bounds the loop. */
  tools?: ToolSet;
  maxSteps?: number;
  /** Called once the full assistant reply is known (after any tool
   *  steps) — used to persist the turn. Must not throw. */
  onFinish?: (result: { text: string }) => void | Promise<void>;
}

/**
 * Streaming multi-turn generation for the Mitra chat widget. Returns the
 * AI SDK stream result; the route handler turns it into a `text/plain`
 * streamed response with `.toTextStreamResponse()`. `resolveModel` can
 * throw for a malformed config — the caller wraps this in try/catch and
 * returns a clean 502 before the stream starts.
 *
 * With `opts.tools`, the model may call tools between text output; the
 * stream still emits only the assistant's text (tool steps are internal).
 */
export function streamChat(
  config: AiConfig,
  system: string,
  messages: ModelMessage[],
  opts: StreamChatOptions = {}
): ReturnType<typeof streamText> {
  const model = resolveModel(config);
  const hasTools = opts.tools && Object.keys(opts.tools).length > 0;
  return streamText({
    model,
    system,
    messages,
    temperature: 0.4,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    ...(hasTools
      ? { tools: opts.tools, stopWhen: stepCountIs(opts.maxSteps ?? 5) }
      : {}),
    ...(opts.onFinish
      ? { onFinish: ({ text }: { text: string }) => opts.onFinish?.({ text }) }
      : {}),
  });
}

/**
 * A cheap round-trip for "Test & save". Only cares whether the call
 * *authenticates and returns* — an empty completion (a thinking model
 * hitting the token cap on "Say OK") still proves the key works, so it
 * does not go through `generateInsightText`'s empty-text check.
 */
export async function validateAiKey(config: AiConfig): Promise<GenerateError | { ok: true }> {
  try {
    const model = resolveModel(config);
    await generateText({ model, prompt: 'Say OK.', maxOutputTokens: 16 });
    return { ok: true };
  } catch (err) {
    console.error('[ai] key validation failed:', err);
    return { ok: false, error: normalizeAiError(err) };
  }
}

/** Pull the most informative text out of an AI SDK / fetch error shape. */
function extractMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (!err || typeof err !== 'object') return String(err ?? '');
  const e = err as Record<string, unknown>;
  const parts: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) parts.push(v.trim());
  };
  push(e.message);
  push(e.responseBody); // APICallError
  push(e.data);
  if (typeof e.statusCode === 'number') parts.push(`HTTP ${e.statusCode}`);
  if (e.cause && typeof e.cause === 'object') push((e.cause as Record<string, unknown>).message);
  return parts.join(' | ').slice(0, 500);
}

export function normalizeAiError(err: unknown): string {
  const msg = extractMessage(err);
  let base: string;
  if (/api[_ ]?key|unauthor|401|permission|invalid.*credential|api key not valid/i.test(msg)) {
    base = 'That API key was rejected by the provider. Check the key and that it matches the selected provider.';
  } else if (/quota|rate.?limit|429|resource.?exhausted/i.test(msg)) {
    base = 'The provider returned a rate-limit / quota error. Try again shortly.';
  } else if (/overloaded|high demand|503|unavailable|try again later/i.test(msg)) {
    // Checked before the "model not found" bucket below — Google's overload
    // message ("This model is currently experiencing high demand...")
    // literally contains the word "model", so without this branch first it
    // was misclassified as a missing-model error even though picking a
    // different model wouldn't help; the provider is just temporarily busy.
    base = 'The provider is temporarily overloaded. This usually clears up within a minute or two — try again shortly.';
  } else if (/\bmodel\b|not found|404/i.test(msg)) {
    base = 'The provider could not find that model. Pick a different one from the dropdown, or leave it on the default.';
  } else {
    base = 'The AI request failed.';
  }
  return msg ? `${base} (provider said: ${msg})` : base;
}
