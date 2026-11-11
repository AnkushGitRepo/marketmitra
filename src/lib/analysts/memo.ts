// Onboarding memo and journal-entry parsing and prompts for the stock analysts (#128, ADR 0058). Pure.

import { z } from 'zod';
import { buildBriefPrompt, type BriefContext } from '@/lib/ai/stockBrief';
import type { StockSignals } from '@/lib/stock/signals';
import type { Dossier, DossierPillar, Impact, MaterialEvent } from './types';

/** The reply shapes asked of the model as constrained output. The tolerant parsers below still normalise whatever comes back. */
export const memoSchema = z.object({
  summary: z.string(),
  business: z.string(),
  strengths: z.array(z.object({ title: z.string(), text: z.string() })),
  vulnerabilities: z.array(z.object({ title: z.string(), text: z.string() })),
  notAvailable: z.array(z.string()),
});

export const entrySchema = z.object({
  title: z.string(),
  body: z.string(),
  impact: z.enum(['positive', 'neutral', 'negative']),
});

const MAX_STRENGTHS = 3;
const MAX_VULNERABILITIES = 2;
const MAX_PILLAR_TEXT = 300;
const MAX_LINE = 160;
const MAX_JOURNAL_TITLE = 140;
const MAX_JOURNAL_BODY = 480;

/** What our free data cannot tell an analyst; named in the prompt so the memo says so instead of inventing it. */
export const DATA_GAPS = ['concall commentary', 'pledged-share trends', 'management and board profiles', 'analyst reports'] as const;

function extractJson(text: string): Record<string, unknown> | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(text.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Cuts at a sentence end when there is one inside the limit, otherwise at a word, so a long reply never ends mid-word. */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const head = t.slice(0, max);
  const sentence = Math.max(head.lastIndexOf('. '), head.lastIndexOf('! '), head.lastIndexOf('? '));
  if (sentence > max * 0.4) return head.slice(0, sentence + 1);
  // The ellipsis counts toward the limit, so the result never exceeds `max`.
  const room = t.slice(0, max - 1);
  const word = room.lastIndexOf(' ');
  return `${(word > max * 0.4 ? room.slice(0, word) : room).replace(/[,;:\s]+$/, '')}…`;
}

const str = (v: unknown, max: number): string => (typeof v === 'string' ? clip(v, max) : '');

/** A pillar as an object, or as a plain string ("Balance sheet: debt is 0.02x"), which models often return instead. */
function toPillar(p: unknown): DossierPillar | null {
  if (typeof p === 'string') {
    const text = p.trim();
    if (!text) return null;
    const colon = text.indexOf(':');
    if (colon > 0 && colon <= 60) return { title: text.slice(0, colon).trim(), text: text.slice(colon + 1).trim().slice(0, MAX_PILLAR_TEXT) };
    return { title: text.split(/\s+/).slice(0, 4).join(' '), text: text.slice(0, MAX_PILLAR_TEXT) };
  }
  if (p && typeof p === 'object') {
    const o = p as Record<string, unknown>;
    const title = str(o.title ?? o.name ?? o.label, MAX_LINE);
    const text = str(o.text ?? o.detail ?? o.description ?? o.body, MAX_PILLAR_TEXT);
    return title && text ? { title, text } : null;
  }
  return null;
}

function pillars(raw: unknown, max: number): DossierPillar[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(toPillar).filter((p): p is DossierPillar => p !== null && p.title !== '' && p.text !== '').slice(0, max);
}

export type ParsedMemo = Omit<Dossier, 'generatedAt' | 'model'>;

export function parseMemo(text: string): ParsedMemo | null {
  const o = extractJson(text);
  if (!o) return null;
  const memo: ParsedMemo = {
    summary: str(o.summary, 520),
    business: str(o.business, 400),
    strengths: pillars(o.strengths, MAX_STRENGTHS),
    vulnerabilities: pillars(o.vulnerabilities, MAX_VULNERABILITIES),
    notAvailable: Array.isArray(o.notAvailable) ? o.notAvailable.map((x) => str(x, MAX_LINE)).filter(Boolean).slice(0, 6) : [],
  };
  return memo.summary || memo.strengths.length || memo.vulnerabilities.length ? memo : null;
}

export function buildMemoPrompt(ctx: BriefContext, signals: StockSignals): string {
  return [
    buildBriefPrompt(ctx, signals),
    `Not available to you (say so in "notAvailable" instead of guessing): ${DATA_GAPS.join(', ')}.`,
  ].join('\n');
}

export interface ParsedEntry {
  title: string;
  body: string;
  impact: Impact;
}

const IMPACT_WORDS: Record<string, Impact> = {
  positive: 'positive',
  bullish: 'positive',
  mildpositive: 'positive',
  negative: 'negative',
  bearish: 'negative',
  mildnegative: 'negative',
  neutral: 'neutral',
  none: 'neutral',
  mixed: 'neutral',
};

export function parseJournalEntry(text: string): ParsedEntry | null {
  const o = extractJson(text);
  if (!o) return null;
  const body = str(o.body, MAX_JOURNAL_BODY);
  if (!body) return null;
  const word = typeof o.impact === 'string' ? o.impact.toLowerCase().replace(/[^a-z]/g, '') : '';
  return { title: str(o.title, MAX_JOURNAL_TITLE), body, impact: IMPACT_WORDS[word] ?? 'neutral' };
}

/** What happened today, set against the baseline thesis, so the analyst can say what it changes. */
export function buildJournalPrompt(events: readonly MaterialEvent[], signals: StockSignals, dossier: Dossier): string {
  const thesis = [
    ...dossier.strengths.map((p) => `Strength: ${p.title}: ${p.text}`),
    ...dossier.vulnerabilities.map((p) => `Vulnerability: ${p.title}: ${p.text}`),
  ].join('\n');
  const s = signals;
  const figures = [
    s.quality.roce !== null ? `ROCE ${s.quality.roce.toFixed(1)}%` : null,
    s.valuation.pe !== null ? `P/E ${s.valuation.pe.toFixed(1)}x` : null,
    s.technical.fromHighPct !== null ? `${s.technical.fromHighPct.toFixed(1)}% vs 52-week high` : null,
  ]
    .filter(Boolean)
    .join('; ');
  return [
    'TODAY\'S EVENTS:',
    ...events.map((e) => `- ${e.title}\n${e.facts.map((f) => `    ${f}`).join('\n')}`),
    'BASELINE THESIS:',
    thesis || '(none recorded)',
    figures ? `CURRENT FIGURES: ${figures}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
