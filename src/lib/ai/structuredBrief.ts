// Parsing and display helpers for the structured Mitra briefs (#125, ADR 0057). Pure.

import { z } from 'zod';
import type { BriefSpec, Tone } from './briefSpecs';

export interface BriefItem {
  key: string;
  tone: Tone;
  text: string;
}

export interface StructuredBrief {
  items: BriefItem[];
}

const MAX_TEXT = 320;

const TONE_WORDS: Record<string, Tone> = {
  positive: 'positive',
  bullish: 'positive',
  strength: 'positive',
  green: 'positive',
  negative: 'warning',
  bearish: 'warning',
  warning: 'warning',
  concern: 'warning',
  risk: 'warning',
  red: 'warning',
  watch: 'warning',
  neutral: 'neutral',
  mixed: 'neutral',
  developing: 'neutral',
  amber: 'neutral',
};

function normalizeTone(raw: unknown): Tone {
  const word = typeof raw === 'string' ? raw.toLowerCase().replace(/[^a-z]/g, '') : '';
  return TONE_WORDS[word] ?? 'neutral';
}

function normalizeKey(raw: string, spec: BriefSpec): string | null {
  const flat = raw.toLowerCase().replace(/[^a-z]/g, '');
  const exact = spec.items.find((i) => i.key === flat);
  if (exact) return exact.key;
  return spec.items.find((i) => i.aliases.some((a) => flat.includes(a)))?.key ?? null;
}

const rawObject = z.record(z.string(), z.unknown());

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

/** Every complete `{ ... }` carrying a "text": what survives when a reply is cut off by the token limit. */
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

/** The list of item-like values wherever the model put them: `items`, `points`, an object keyed by name, or another array. */
function candidates(obj: Record<string, unknown>): unknown[] {
  for (const name of ['items', 'points']) {
    const v = obj[name];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>).map(([key, val]) => (typeof val === 'string' ? { key, text: val } : { key, ...(val as object) }));
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === 'object')) return v;
  }
  return [];
}

function toItem(raw: unknown, spec: BriefSpec): BriefItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { key, title, label, tone, sentiment, text } = raw as Record<string, unknown>;
  const name = [key, title, label].find((x): x is string => typeof x === 'string');
  const mapped = name ? normalizeKey(name, spec) : null;
  if (!mapped || typeof text !== 'string' || !text.trim()) return null;
  return { key: mapped, tone: normalizeTone(tone ?? sentiment), text: text.trim().slice(0, MAX_TEXT) };
}

/** Parses a model reply into the surface's items. Null when nothing usable can be recovered. */
export function parseStructured(text: string, spec: BriefSpec): StructuredBrief | null {
  const whole = rawObject.safeParse(extractJson(text));
  const raws = whole.success ? candidates(whole.data) : salvageObjects(text);
  const seen = new Set<string>();
  const items: BriefItem[] = [];
  for (const raw of raws) {
    const item = toItem(raw, spec);
    if (item && !seen.has(item.key)) {
      seen.add(item.key);
      items.push(item);
    }
  }
  if (items.length === 0) return null;
  const order = spec.items.map((i) => i.key);
  items.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return { items };
}

/** What the insights cache stores: valid JSON only, so a cached prose brief from before #125 is simply ignored. */
export function serializeBrief(brief: StructuredBrief): string {
  return JSON.stringify({ items: brief.items });
}

export function readStoredBrief(content: string | null | undefined, spec: BriefSpec): StructuredBrief | null {
  if (!content || !content.trim().startsWith('{')) return null;
  return parseStructured(content, spec);
}

export function toneLabel(tone: Tone, spec: BriefSpec): string {
  return spec.toneLabels[tone];
}

export type TickerSegment = { type: 'text'; value: string } | { type: 'ticker'; value: string };

const TICKER_TAG = /\[([A-Z][A-Z0-9&-]{1,19})\]/g;

/** Splits text on `[PNB]`-style tags so the UI can render them as links. */
export function splitTickers(text: string): TickerSegment[] {
  const out: TickerSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TICKER_TAG)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', value: text.slice(last, at) });
    out.push({ type: 'ticker', value: m[1] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out.length ? out : [{ type: 'text', value: text }];
}

/** Keeps `[TICKER]` tags only for tickers in the data (case-insensitive); other tags lose their brackets, so no link points at an invented ticker. */
export function sanitizeTickers(text: string, allowed: ReadonlySet<string>): string {
  return text.replace(/\[([A-Za-z][A-Za-z0-9&-]{1,19})\]/g, (_m, t: string) => (allowed.has(t.toUpperCase()) ? `[${t.toUpperCase()}]` : t));
}
