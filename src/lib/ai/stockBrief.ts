// The 360 Mitra brief on the stock page (#115, ADR 0056): up to five fixed points, each with a signal, written from the
// computed data in `StockSignals`. In unrestricted mode (local only, ADR 0054) it may also carry a valuation and an entry
// view. Pure: parsing, sanitising and prompt building; the model call lives in the route.

import { z } from 'zod';
import type { StockSignals } from '@/lib/stock/signals';
import type { StockInsightInput } from './insightPrompts';
import type { PromptMode } from './promptMode';
import { wrapUntrusted } from './untrusted';

export const POINT_KEYS = ['quality', 'growth', 'valuation', 'ownership', 'risk'] as const;
export type PointKey = (typeof POINT_KEYS)[number];
export type Signal = 'strength' | 'neutral' | 'concern';

export const POINT_TITLES: Record<PointKey, string> = {
  quality: 'Financial quality',
  growth: 'Growth and momentum',
  valuation: 'Valuation check',
  ownership: 'Smart money',
  risk: 'Biggest risk',
};

export const VALUATION_VIEWS = ['undervalued', 'fairly valued', 'overvalued', 'unclear'] as const;
export type ValuationView = (typeof VALUATION_VIEWS)[number];

export interface BriefPoint {
  key: PointKey;
  signal: Signal;
  text: string;
}

export interface StockBrief {
  points: BriefPoint[];
  /** Unrestricted mode only. */
  valuation?: ValuationView;
  entry?: string;
}

const MAX_TEXT = 320;
const MAX_ENTRY = 240;

const SIGNAL_WORDS: Record<string, Signal> = {
  strength: 'strength',
  bullish: 'strength',
  positive: 'strength',
  neutral: 'neutral',
  mixed: 'neutral',
  concern: 'concern',
  bearish: 'concern',
  negative: 'concern',
  risk: 'concern',
};

/** Models often use the descriptive title ("Financial Quality & Moat") instead of the key. Match on the topic word. */
const KEY_TOPICS: ReadonlyArray<readonly [PointKey, readonly string[]]> = [
  ['quality', ['quality', 'moat', 'capital']],
  ['growth', ['growth', 'momentum', 'operational']],
  ['valuation', ['valuation', 'multiple']],
  ['ownership', ['ownership', 'smartmoney', 'institution', 'conviction', 'shareholder']],
  ['risk', ['risk', 'headwind', 'asymmetric']],
];

function normalizeKey(raw: string): PointKey | null {
  const flat = raw.toLowerCase().replace(/[^a-z]/g, '');
  const exact = (POINT_KEYS as readonly string[]).includes(flat) ? (flat as PointKey) : null;
  if (exact) return exact;
  return KEY_TOPICS.find(([, words]) => words.some((w) => flat.includes(w)))?.[0] ?? null;
}

function normalizeSignal(raw: unknown): Signal {
  // "[BULLISH]", "Bullish", "strength" all map; a missing or unknown signal reads as neutral rather than losing the point.
  const word = typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z]/g, '') : '';
  return SIGNAL_WORDS[word] ?? 'neutral';
}

const rawBrief = z.record(z.string(), z.unknown());

/** Parses the first `{ ... }` in the text. Fences and trailing text are ignored. */
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

/** Every complete `{ ... }` (no nesting) that carries a "text": what survives when a reply is cut off by the token limit. */
function salvageObjects(text: string): unknown[] {
  const out: unknown[] = [];
  for (const m of text.matchAll(/\{[^{}]*"text"[^{}]*\}/g)) {
    try {
      out.push(JSON.parse(m[0]));
    } catch {
      /* skip a fragment that is not valid JSON */
    }
  }
  return out;
}

/** The list of point-like values, wherever the model put them: `points: []`, `points: {name: ...}` or another array property. */
function pointCandidates(obj: Record<string, unknown>): unknown[] {
  const direct = obj.points;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === 'object') {
    return Object.entries(direct as Record<string, unknown>).map(([key, v]) => (typeof v === 'string' ? { key, text: v } : { key, ...(v as object) }));
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) return v;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const nested = (v as Record<string, unknown>).points;
      if (Array.isArray(nested)) return nested;
    }
  }
  return [];
}

function toPoint(raw: unknown): BriefPoint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { key, title, signal, text } = raw as Record<string, unknown>;
  const label = typeof key === 'string' ? key : typeof title === 'string' ? title : null;
  const mapped = label ? normalizeKey(label) : null;
  if (!mapped || typeof text !== 'string' || !text.trim()) return null;
  return { key: mapped, signal: normalizeSignal(signal), text: text.trim().slice(0, MAX_TEXT) };
}

export function parseBrief(text: string): StockBrief | null {
  const whole = rawBrief.safeParse(extractJson(text));
  const candidates = whole.success ? pointCandidates(whole.data) : salvageObjects(text);
  const seen = new Set<PointKey>();
  const points: BriefPoint[] = [];
  for (const raw of candidates) {
    const point = toPoint(raw);
    if (point && !seen.has(point.key)) {
      seen.add(point.key);
      points.push(point);
    }
  }
  if (points.length === 0) return null;
  points.sort((a, b) => POINT_KEYS.indexOf(a.key) - POINT_KEYS.indexOf(b.key));
  const brief: StockBrief = { points };
  const valuation = whole.success ? whole.data.valuation : undefined;
  const entry = whole.success ? whole.data.entry : undefined;
  if (typeof valuation === 'string' && (VALUATION_VIEWS as readonly string[]).includes(valuation)) brief.valuation = valuation as ValuationView;
  if (typeof entry === 'string' && entry.trim()) brief.entry = entry.trim().slice(0, MAX_ENTRY);
  return brief;
}

/** Guarded mode never returns a verdict, even if the model produced one. */
export function sanitizeBrief(brief: StockBrief, mode: PromptMode): StockBrief {
  if (mode === 'unrestricted') return { ...brief, points: brief.points.map((p) => ({ ...p })) };
  return { points: brief.points.map((p) => ({ ...p })) };
}

/** Guarded mode describes the factor ("Strength"); market wording ("Bullish") exists only in unrestricted mode. */
export function signalLabel(signal: Signal, mode: PromptMode): string {
  if (mode === 'unrestricted') return signal === 'strength' ? 'Bullish' : signal === 'concern' ? 'Bearish' : 'Neutral';
  return signal === 'strength' ? 'Strength' : signal === 'concern' ? 'Concern' : 'Neutral';
}

/** The little of the stock's identity the prompt needs. Deliberately no company description: the model must not retell it. */
export type BriefContext = Pick<StockInsightInput, 'symbol' | 'company' | 'latestClose' | 'news'>;

const NA = 'not available';
const f = (n: number | null, digits = 1, suffix = '') => (n === null ? NA : `${n.toFixed(digits)}${suffix}`);
const signed = (n: number | null, digits = 1, suffix = '') => (n === null ? NA : `${n >= 0 ? '+' : ''}${n.toFixed(digits)}${suffix}`);

/** The user-content half of the brief prompt: every computed figure, with gaps stated rather than left to be guessed. */
export function buildBriefPrompt(input: BriefContext, s: StockSignals): string {
  const q = s.quality;
  const fcf = q.freeCashFlow ? `₹${q.freeCashFlow.value.toLocaleString('en-IN')} Cr (${q.freeCashFlow.period})` : NA;
  const own = s.ownership;
  const holding = (label: string, h: { pct: number; delta1q: number | null } | null) =>
    h ? `${label} ${h.pct.toFixed(1)}% (${signed(h.delta1q, 1, ' pts QoQ')})` : `${label} ${NA}`;
  const news = input.news.length ? wrapUntrusted(input.news.map((n) => `[${n.sentiment}] ${n.title}`)) : '(no recent headlines)';
  return [
    `Company: ${input.company.name} (${input.symbol}), ${input.company.sector ?? 'sector n/a'} / ${input.company.industry ?? 'industry n/a'}.`,
    `Last close: ${input.latestClose === null ? NA : `₹${input.latestClose.toLocaleString('en-IN')}`}.`,
    `QUALITY: ROCE ${f(q.roce, 1, '%')}; ROE ${f(q.roe, 1, '%')}; debt/equity ${q.isFinancial ? 'not meaningful for a financial company' : f(q.debtToEquity, 2, 'x')}; free cash flow ${q.isFinancial ? 'not meaningful for a financial company' : fcf}.`,
    `GROWTH: 3-year sales CAGR ${f(s.growth.salesCagr3y, 1, '%')}; 3-year profit CAGR ${f(s.growth.profitCagr3y, 1, '%')}; latest quarter sales YoY ${signed(s.growth.qtrSalesYoyPct, 1, '%')}; latest quarter profit YoY ${signed(s.growth.qtrProfitYoyPct, 1, '%')}.`,
    `VALUATION: P/E ${f(s.valuation.pe, 1, 'x')}; P/B ${f(s.valuation.pb, 2, 'x')}; peer median P/E ${f(s.valuation.peerMedianPe, 1, 'x')}; P/E vs peer median ${signed(s.valuation.peVsPeersPct, 0, '%')}. Historical (5-year) median multiples are ${NA}.`,
    `OWNERSHIP (${own.latestQuarter ?? NA}): ${holding('promoter', own.promoter)}; promoter change over 4 quarters ${signed(own.promoter?.delta4q ?? null, 1, ' pts')}; ${holding('FII', own.fii)}; ${holding('DII', own.dii)}. Pledged shares are ${NA}.`,
    `NEWS TONE: ${s.sentiment.total} recent headlines, ${f(s.sentiment.positivePct, 0, '%')} positive, ${f(s.sentiment.negativePct, 0, '%')} negative.`,
    `TECHNICAL: ${signed(s.technical.fromHighPct, 1, '% vs 52-week high')}; ${signed(s.technical.vs200dmPct, 1, '% vs 200-day average')}.`,
    `Recent headlines:\n${news}`,
  ].join('\n');
}

/** Chat chips that open Mitra with a question already typed (never sent automatically). */
export function chipPrompts(symbol: string, mode: PromptMode): [string, string] {
  return mode === 'unrestricted'
    ? [`Is ${symbol} undervalued at its current price? Show the numbers behind your view.`, `Stress-test ${symbol}: what would have to go wrong for this valuation to look wrong? Show the numbers.`]
    : [`Summarise ${symbol}'s valuation ratios against its peers and its own price range.`, `What could weaken ${symbol}'s margins or cash flow? Use the data you have.`];
}
