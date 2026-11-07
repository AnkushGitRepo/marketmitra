import { issuesToText, validateMemo, type ClaimIssue } from './cite';
import { buildMemoPrompt, buildRetryPrompt, MEMO_PROMPT_VERSION, MEMO_SYSTEM } from './prompts/v1';
import type { Memo, SourceRef } from './types';

export type GenerateFn = (
  system: string,
  prompt: string,
) => Promise<{ ok: true; text: string; model: string } | { ok: false; error: string }>;

export type MemoRun =
  | { ok: true; memo: Memo; model: string; attempts: number; promptVersion: string }
  | { ok: false; reason: 'generation_failed' | 'rejected'; error: string; issues: ClaimIssue[]; attempts: number };

const MAX_ATTEMPTS = 2;

/** Pulls the JSON object out of a model reply (tolerates code fences / prose). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Generate a memo, validate it, and allow one repair attempt. A memo that
 * still fails validation is rejected — it is never shown or stored as a result. */
export async function generateMemo(args: {
  symbol: string;
  name: string;
  sector: string | null;
  sources: SourceRef[];
  generate: GenerateFn;
}): Promise<MemoRun> {
  const base = buildMemoPrompt(args);
  let prompt = base;
  let issues: ClaimIssue[] = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const res = await args.generate(MEMO_SYSTEM, prompt);
    if (!res.ok) return { ok: false, reason: 'generation_failed', error: res.error, issues: [], attempts: attempt };
    const json = extractJson(res.text);
    if (json === null) {
      issues = [{ path: 'memo', message: 'The reply was not a valid JSON object.' }];
    } else {
      const v = validateMemo(json, args.sources);
      if (v.ok) return { ok: true, memo: v.memo, model: res.model, attempts: attempt, promptVersion: MEMO_PROMPT_VERSION };
      issues = v.issues;
    }
    prompt = buildRetryPrompt(base, res.text, issuesToText(issues));
  }
  return {
    ok: false,
    reason: 'rejected',
    error: 'The memo could not be grounded in the provided material.',
    issues,
    attempts: MAX_ATTEMPTS,
  };
}
