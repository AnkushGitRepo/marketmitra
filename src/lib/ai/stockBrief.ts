// The structured Mitra brief on the stock page (#103, ADR 0054): up to 2 strengths and 1 watchpoint
// from public data. In unrestricted mode (local only) it may also carry a valuation view and an entry
// view. Pure: parsing, sanitising and prompt building; the model call lives in the route.

import { z } from 'zod';
import type { StockInsightInput } from './insightPrompts';
import type { PromptMode } from './promptMode';

export const VALUATION_VIEWS = ['undervalued', 'fairly valued', 'overvalued', 'unclear'] as const;
export type ValuationView = (typeof VALUATION_VIEWS)[number];

export interface StockBrief {
  strengths: string[];
  watchpoints: string[];
  /** Unrestricted mode only. */
  valuation?: ValuationView;
  entry?: string;
}

const MAX_STRENGTHS = 2;
const MAX_WATCHPOINTS = 1;
const MAX_LINE = 240;

const lines = (max: number) =>
  z
    .array(z.unknown())
    .transform((a) => a.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, MAX_LINE)).filter(Boolean).slice(0, max));

const rawBrief = z.object({
  strengths: lines(MAX_STRENGTHS),
  watchpoints: lines(MAX_WATCHPOINTS),
  valuation: z.unknown().optional(),
  entry: z.unknown().optional(),
});

/** First balanced-looking `{ ... }` in the text, so fences and a trailing disclaimer do not break parsing. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

export function parseBrief(text: string): StockBrief | null {
  const parsed = rawBrief.safeParse(extractJson(text));
  if (!parsed.success) return null;
  const { strengths, watchpoints, valuation, entry } = parsed.data;
  if (strengths.length === 0 && watchpoints.length === 0) return null;
  const brief: StockBrief = { strengths, watchpoints };
  if (typeof valuation === 'string' && (VALUATION_VIEWS as readonly string[]).includes(valuation)) brief.valuation = valuation as ValuationView;
  if (typeof entry === 'string' && entry.trim()) brief.entry = entry.trim().slice(0, MAX_LINE);
  return brief;
}

/** Guarded mode never returns a verdict, even if the model produced one. */
export function sanitizeBrief(brief: StockBrief, mode: PromptMode): StockBrief {
  if (mode === 'unrestricted') return { ...brief };
  return { strengths: [...brief.strengths], watchpoints: [...brief.watchpoints] };
}

export interface BriefFacts {
  pe: number | null;
  pb: number | null;
  peerMedianPe: number | null;
  /** Position inside the 52-week range, 0-100. */
  rangePct: number | null;
  range: { low: number; high: number } | null;
}

const times = (n: number | null) => (n === null ? 'not available' : `${n.toFixed(1)}x`);

/** The user-content half of the brief prompt: the shared stock data plus the computed valuation facts. */
export function buildBriefPrompt(input: StockInsightInput, facts: BriefFacts): string {
  const ratios = input.ratios.map((r) => `${r.name}: ${r.value ?? '—'}${r.unit ? ` ${r.unit}` : ''}`).join('; ');
  const fin = input.financialsSummary.map((f) => `${f.label}: ${f.latest ?? '—'} (prior ${f.prior ?? '—'})`).join('; ');
  const news = input.news.length ? input.news.map((n) => `- [${n.sentiment}] ${n.title}`).join('\n') : '(no recent headlines)';
  const rangeText =
    facts.range && facts.rangePct !== null
      ? `52-week range ₹${facts.range.low.toLocaleString('en-IN')} to ₹${facts.range.high.toLocaleString('en-IN')}; the price is ${facts.rangePct}% of the way up`
      : '52-week position not available';
  return [
    `Company: ${input.company.name} (${input.symbol}), ${input.company.sector ?? 'sector n/a'} / ${input.company.industry ?? 'industry n/a'}.`,
    `Last close: ${input.latestClose === null ? '—' : `₹${input.latestClose.toLocaleString('en-IN')}`}.`,
    `Valuation facts (computed, use these): P/E ${times(facts.pe)}; P/B ${times(facts.pb)}; peer median P/E ${times(facts.peerMedianPe)}; ${rangeText}.`,
    `Key ratios: ${ratios || '(none available)'}.`,
    `Recent financials: ${fin || '(none available)'}.`,
    `Recent news:\n${news}`,
  ].join('\n');
}

export function chipPrompt(symbol: string, mode: PromptMode): string {
  return mode === 'unrestricted'
    ? `Is ${symbol} undervalued at its current price? Show the numbers behind your view.`
    : `Summarise ${symbol}'s valuation ratios against its peers and its own price range.`;
}
