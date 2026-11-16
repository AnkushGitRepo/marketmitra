import { z } from 'zod';
import type { AiConfig } from '@/lib/ai/providers';

// A decision model answers typed questions about an input with probabilities and writes no text
// (Gemini Decisions API, https://aistudio.google.com/docs/decisions-api). This client covers the
// yes/no ("noul") question only, over plain REST so it adds no dependency. It is available only to
// a user whose own AI provider is Gemini; every caller keeps its existing behaviour as the fallback.
// The input, the key and the provider's error text are never put into a returned message, because
// callers log it.

export const DECISION_MODEL = 'gemini-decision-1';
export const DECISIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/decisions';
/** Callers wait on this inside a chat request, so it is short; a slow answer is as good as none. */
export const DEFAULT_TIMEOUT_MS = 4_000;

const MAX_QUESTIONS = 1_000;
const KEY_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type YesNoFailure = 'unavailable' | 'rejected' | 'failed';

export type YesNoResult =
  | { ok: true; answers: Record<string, { yes: number; confidence: number }> }
  | { ok: false; reason: YesNoFailure; message: string };

export interface DecisionDeps {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const requestSchema = z.object({
  input: z.string().trim().min(1),
  questions: z
    .record(z.string().regex(KEY_PATTERN), z.string().trim().min(1))
    .refine((q) => Object.keys(q).length >= 1 && Object.keys(q).length <= MAX_QUESTIONS, 'between 1 and 1000 questions'),
});

const answerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
});
const responseSchema = z.object({ answers: z.record(z.string(), answerSchema) });

const errorCode = (body: unknown): string | null => {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'string' && /^[a-z_]{1,40}$/.test(code) ? code : null;
};

const fail = (reason: YesNoFailure, message: string): YesNoResult => ({ ok: false, reason, message });

/** One shared input and one or more yes/no questions; resolves to P(yes) per question key. Never throws. */
export async function askYesNo(
  config: AiConfig | null,
  input: string,
  questions: Readonly<Record<string, string>>,
  deps: DecisionDeps = {},
): Promise<YesNoResult> {
  if (!config || config.provider !== 'gemini' || !config.apiKey) return fail('unavailable', 'Decision model needs a Gemini key.');
  const request = requestSchema.safeParse({ input, questions });
  if (!request.success) return fail('rejected', 'Invalid decision request.');

  const body = {
    model: DECISION_MODEL,
    input: request.data.input,
    questions: Object.fromEntries(Object.entries(request.data.questions).map(([key, instructions]) => [key, { type: 'noul', instructions }])),
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await (deps.fetch ?? fetch)(DECISIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.status === 400) {
      const code = errorCode(json);
      return fail('rejected', `Decision API refused the request (HTTP 400${code ? `, ${code}` : ''}).`);
    }
    if (!res.ok) return fail('failed', `Decision API error (HTTP ${res.status}).`);
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success) return fail('failed', 'Decision API reply was not in the expected shape.');
    const answers: Record<string, { yes: number; confidence: number }> = {};
    for (const key of Object.keys(request.data.questions)) {
      const answer = parsed.data.answers[key];
      if (!answer) return fail('failed', 'Decision API reply was missing an answer.');
      answers[key] = { yes: answer.noul, confidence: answer.confidence };
    }
    return { ok: true, answers };
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return fail('failed', aborted ? 'Decision API timed out.' : 'Decision API request failed.');
  } finally {
    clearTimeout(timer);
  }
}
