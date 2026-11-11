// Pure helpers for the News page: tone badges, excerpts, the hero story, trending tickers and the pulse prompt. No clock,
// network or storage ("now" is passed in), so they test without mocks.

import type { NewsItem, NewsSentiment } from '@/lib/dashboard/newsApi';
import { classifyTopic, type NewsTopic } from './topics';

export interface ToneView {
  readonly label: string;
  readonly arrow: string;
  /** What the pill's tooltip says: this is a headline-tone read, not a call on the stock. */
  readonly title: string;
}

export const TONE_VIEW: Record<NewsSentiment, ToneView> = {
  positive: { label: 'Positive', arrow: '▲', title: 'Positive headline tone (VADER). A read of the wording, not a signal.' },
  negative: { label: 'Negative', arrow: '▼', title: 'Negative headline tone (VADER). A read of the wording, not a signal.' },
  neutral: { label: 'Neutral', arrow: '–', title: 'Neutral headline tone (VADER). A read of the wording, not a signal.' },
};

const ENTITIES: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&lt;': '<', '&gt;': '>' };
const MAX_EXCERPT_CHARS = 200;

/** Feeds sometimes double-encode ("M&amp;amp;M"), so decode until the text stops changing (bounded). */
function decodeEntities(text: string): string {
  let out = text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = out.replace(/&(?:amp|nbsp|quot|apos|lt|gt|#39);/g, (m) => ENTITIES[m] ?? m);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** A plain-text excerpt: tags and entities removed, whitespace collapsed, cut at a word boundary. Null when empty or a repeat of the title. */
export function cleanExcerpt(summary: string | null, title: string, max = MAX_EXCERPT_CHARS): string | null {
  if (!summary) return null;
  const text = decodeEntities(summary.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!text || norm(text) === norm(title) || norm(text).startsWith(norm(title)) && norm(text).length - norm(title).length < 20) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,.;:–-]+$/, '')}…`;
}

const time = (item: Pick<NewsItem, 'published_at'>): number => new Date(item.published_at).getTime();

/** The story given the large card: the newest one (the data carries no importance score, so none is implied). */
export function pickHero<T extends Pick<NewsItem, 'published_at'>>(items: readonly T[]): T | null {
  return items.reduce<T | null>((best, item) => (best === null || time(item) > time(best) ? item : best), null);
}

export interface TrendingTicker {
  readonly symbol: string;
  readonly count: number;
  readonly latest: string;
}

const HOUR_MS = 3_600_000;

/** The most-mentioned tickers in the last `windowHours`, by story count (ties: most recent, then name). */
export function trendingTickers(
  items: readonly Pick<NewsItem, 'symbols' | 'published_at'>[],
  now: Date,
  { limit = 5, windowHours = 24 }: { limit?: number; windowHours?: number } = {}
): TrendingTicker[] {
  const cutoff = now.getTime() - windowHours * HOUR_MS;
  const tally = new Map<string, { count: number; latest: string }>();
  for (const item of items) {
    if (time(item) < cutoff) continue;
    for (const symbol of new Set(item.symbols.map((s) => s.toUpperCase()))) {
      const cur = tally.get(symbol);
      tally.set(symbol, {
        count: (cur?.count ?? 0) + 1,
        latest: cur && cur.latest > item.published_at ? cur.latest : item.published_at,
      });
    }
  }
  return [...tally.entries()]
    .map(([symbol, v]) => ({ symbol, ...v }))
    .sort((a, b) => b.count - a.count || (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0) || a.symbol.localeCompare(b.symbol))
    .slice(0, limit);
}

/** Stories on one topic; null keeps everything (untagged stories are only ever shown under All). */
export function filterByTopic<T extends Pick<NewsItem, 'title'>>(items: readonly T[], topic: NewsTopic | null): T[] {
  return topic === null ? [...items] : items.filter((i) => classifyTopic(i) === topic);
}

/** The only facts the news pulse may use: the headlines on the page, with their source and tone. */
export function buildNewsPulsePrompt(items: readonly Pick<NewsItem, 'title' | 'source' | 'sentiment'>[], limit = 20): string {
  const lines = items.slice(0, limit).map((i) => `- ${i.title} (${i.source}, ${i.sentiment} tone)`);
  return lines.length > 0 ? `Latest Indian markets headlines:\n${lines.join('\n')}` : 'No headlines are available.';
}
