import { chunkText } from '@/lib/rag/chunk';
import type { ScreenResult } from '../screen/types';
import type { SourceRef } from './types';

// Turns a filing's raw text into a bounded set of citable passages, and the
// screen result into citable facts. Pure — no network.

const SECTION_HINTS = [
  'business overview', 'our business', 'competitive', 'competition', 'moat', 'market share', 'customers',
  'strategy', 'outlook', 'risk', 'management discussion', 'capital allocation', 'dividend', 'buyback',
  'acquisition', 'related party', 'corporate governance', 'board of directors', 'remuneration', 'brand',
  'switching', 'pricing power', 'capex', 'debt', 'promoter',
];

function score(text: string): number {
  const lower = text.toLowerCase();
  const letters = (text.match(/[a-z]/gi) ?? []).length;
  if (text.length < 300 || letters / text.length < 0.6) return 0; // tables, page furniture
  let s = 0;
  for (const h of SECTION_HINTS) if (lower.includes(h)) s += 1;
  return s;
}

export interface PassageOptions {
  idPrefix: string;
  label: string;
  /** Total characters of passages to keep (≈ prompt budget). */
  budgetChars?: number;
}

export function buildPassages(text: string, opts: PassageOptions): SourceRef[] {
  const budget = opts.budgetChars ?? 60_000;
  const chunks = chunkText(text, { maxChars: 1800, overlapChars: 0, minChars: 300 });
  const ranked = chunks
    .map((c) => ({ c, s: score(c.text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.c.index - b.c.index);

  const picked: typeof ranked = [];
  let used = 0;
  for (const r of ranked) {
    if (used + r.c.text.length > budget) continue;
    picked.push(r);
    used += r.c.text.length;
  }
  return picked
    .sort((a, b) => a.c.index - b.c.index)
    .map((r) => ({
      id: `${opts.idPrefix}-${String(r.c.index).padStart(3, '0')}`,
      label: opts.label,
      kind: 'passage' as const,
      text: r.c.text,
    }));
}

/** The screen's measured values, as citable facts F1…Fn. */
export function buildFacts(result: ScreenResult): SourceRef[] {
  return result.gates
    .filter((g) => g.status === 'pass' || g.status === 'fail')
    .map((g, i) => ({
      id: `F${i + 1}`,
      label: `Screen: ${g.label}`,
      kind: 'fact' as const,
      text: `${g.label}: ${g.actual} (rule: ${g.threshold}; ${g.status})`,
    }));
}
