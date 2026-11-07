import { scanForTradeActions } from '@/lib/agents/tradeActionCheck';
import {
  KILL_METRIC_RANGE,
  memoSchema,
  type Claim,
  type Memo,
  type SourceRef,
} from './types';

// Citation enforcement. A memo is accepted only if every claim is either backed
// by a verbatim quote from a source we actually supplied, or explicitly marked
// "not found" — and no number appears that isn't in a cited quote.

export const NOT_FOUND_TEXT = 'not found in provided material';

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** Numbers as comparable tokens: "₹1,23,456.7 crore" → "123456.7", "12%" → "12". */
export function numbersIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const raw = m[0].replace(/,/g, '').replace(/\.0+$/, '');
    // A lone single digit ("3 risks", "two") is prose, not a figure — unless it is a percentage or decimal.
    const after = text[(m.index ?? 0) + m[0].length];
    if (/^\d$/.test(raw) && after !== '%') continue;
    out.push(raw);
  }
  return out;
}

export interface ClaimIssue {
  path: string;
  message: string;
}

function checkClaim(path: string, claim: Claim, sources: Map<string, SourceRef>): ClaimIssue[] {
  const issues: ClaimIssue[] = [];
  if (claim.notFound) {
    if (claim.citations.length > 0) {
      issues.push({ path, message: 'A "not found" claim must not carry citations.' });
    }
    if (numbersIn(claim.text).length > 0) {
      issues.push({ path, message: 'A "not found" claim must not state figures.' });
    }
    return issues;
  }
  if (claim.citations.length === 0) {
    issues.push({ path, message: 'Uncited claim: add a verbatim citation or mark it "not found in provided material".' });
    return issues;
  }
  const quotes: string[] = [];
  claim.citations.forEach((c, i) => {
    const src = sources.get(c.sourceId);
    if (!src) {
      issues.push({ path: `${path}.citations[${i}]`, message: `Unknown source id "${c.sourceId}".` });
      return;
    }
    if (!normalise(src.text).includes(normalise(c.quote))) {
      issues.push({
        path: `${path}.citations[${i}]`,
        message: `Quote is not a verbatim excerpt of ${c.sourceId}.`,
      });
      return;
    }
    quotes.push(normalise(c.quote).replace(/,/g, ''));
  });
  // Every figure in the claim must appear in a quote that really exists.
  const joined = quotes.join(' | ');
  for (const n of numbersIn(claim.text)) {
    if (!joined.includes(n)) {
      issues.push({ path, message: `The figure "${n}" is not in any cited quote.` });
    }
  }
  return issues;
}

function allClaims(memo: Memo): Array<{ path: string; claim: Claim }> {
  const out: Array<{ path: string; claim: Claim }> = [];
  memo.business.forEach((c, i) => out.push({ path: `business[${i}]`, claim: c }));
  out.push({ path: 'moat.assessment', claim: memo.moat.assessment });
  memo.moat.erosionRisks.forEach((c, i) => out.push({ path: `moat.erosionRisks[${i}]`, claim: c }));
  memo.management.forEach((c, i) => out.push({ path: `management[${i}]`, claim: c }));
  memo.capitalAllocation.forEach((c, i) => out.push({ path: `capitalAllocation[${i}]`, claim: c }));
  memo.risks.forEach((c, i) => out.push({ path: `risks[${i}]`, claim: c }));
  out.push({ path: 'thesis', claim: memo.thesis });
  memo.killCriteria.forEach((k, i) => out.push({ path: `killCriteria[${i}].rationale`, claim: k.rationale }));
  return out;
}

export type ValidationResult = { ok: true; memo: Memo } | { ok: false; issues: ClaimIssue[] };

/** Validate raw model output (already JSON-parsed) against schema, citations and tone. */
export function validateMemo(raw: unknown, sources: SourceRef[]): ValidationResult {
  const parsed = memoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.') || 'memo', message: i.message })),
    };
  }
  const memo = parsed.data;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const issues: ClaimIssue[] = [];

  for (const { path, claim } of allClaims(memo)) {
    issues.push(...checkClaim(path, claim, byId));
    const scan = scanForTradeActions(claim.text);
    if (!scan.ok) issues.push({ path, message: `Trade-call language is not allowed ("${scan.hits[0]}").` });
  }
  const sentences = memo.thesis.text.split(/(?<=[.!?])\s+/).filter(Boolean).length;
  if (sentences > 3) issues.push({ path: 'thesis', message: 'The thesis must be 2–3 sentences.' });

  memo.killCriteria.forEach((k, i) => {
    const r = KILL_METRIC_RANGE[k.metric];
    if (k.threshold < r.min || k.threshold > r.max) {
      issues.push({ path: `killCriteria[${i}].threshold`, message: `Threshold ${k.threshold} is outside the sensible range for ${k.metric}.` });
    }
  });
  return issues.length === 0 ? { ok: true, memo } : { ok: false, issues };
}

export const issuesToText = (issues: ClaimIssue[]) =>
  issues.slice(0, 25).map((i) => `- ${i.path}: ${i.message}`).join('\n');
