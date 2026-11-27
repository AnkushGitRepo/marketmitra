import type { NewsItem, NewsSentiment } from '@/lib/dashboard/newsApi';

export type NewsImpact = 'high' | 'material' | 'routine';
export type NewsFilter = 'all' | 'high' | 'bullish' | 'bearish';

export interface HeldWeight {
  readonly symbol: string;
  /** Share of the portfolio's priced value, in percent. */
  readonly weightPct: number;
}

export interface LinkedNews {
  readonly item: NewsItem;
  /** The held symbols this story tags, biggest position first. */
  readonly holdings: readonly HeldWeight[];
  readonly impact: NewsImpact;
}

/** A story is high impact when its tone is strong and it touches a position this large (percent of the book). */
export const HIGH_IMPACT_SCORE = 0.5;
export const HIGH_IMPACT_WEIGHT_PCT = 10;
/** A clearly one-sided tone is material even on a small position. */
export const MATERIAL_SCORE = 0.3;

/**
 * Impact is derived, not invented: how strong the story's own sentiment score is, and how much of the book it touches.
 * Neutral tone is always routine, whatever the weight.
 */
export function classifyImpact(sentiment: NewsSentiment, score: number, topWeightPct: number): NewsImpact {
  if (sentiment === 'neutral') return 'routine';
  const strength = Math.abs(score);
  if (strength >= HIGH_IMPACT_SCORE && topWeightPct >= HIGH_IMPACT_WEIGHT_PCT) return 'high';
  if (strength >= MATERIAL_SCORE) return 'material';
  return 'routine';
}

/** Keeps stories that tag a held symbol and attaches those holdings with their weights, newest first as given. */
export function linkNews(items: readonly NewsItem[], weights: readonly HeldWeight[]): LinkedNews[] {
  const bySymbol = new Map(weights.map((w) => [w.symbol.toUpperCase(), w]));
  const out: LinkedNews[] = [];
  for (const item of items) {
    const held = [...new Set(item.symbols.map((s) => s.toUpperCase()))]
      .map((s) => bySymbol.get(s))
      .filter((w): w is HeldWeight => w !== undefined)
      .sort((a, b) => b.weightPct - a.weightPct);
    if (held.length === 0) continue;
    out.push({ item, holdings: held, impact: classifyImpact(item.sentiment, item.sentiment_score, held[0].weightPct) });
  }
  return out;
}

export function filterNews(rows: readonly LinkedNews[], filter: NewsFilter, symbol: string | null): LinkedNews[] {
  return rows.filter((r) => {
    if (symbol && !r.holdings.some((h) => h.symbol === symbol)) return false;
    if (filter === 'high') return r.impact === 'high';
    if (filter === 'bullish') return r.item.sentiment === 'positive';
    if (filter === 'bearish') return r.item.sentiment === 'negative';
    return true;
  });
}

export function newsFilterCounts(rows: readonly LinkedNews[]): Record<NewsFilter, number> {
  return {
    all: rows.length,
    high: rows.filter((r) => r.impact === 'high').length,
    bullish: rows.filter((r) => r.item.sentiment === 'positive').length,
    bearish: rows.filter((r) => r.item.sentiment === 'negative').length,
  };
}

const TONE: Record<NewsSentiment, string> = { positive: 'Bullish', negative: 'Bearish', neutral: 'Neutral' };
const IMPACT: Record<NewsImpact, string> = { high: 'High impact', material: 'Material', routine: 'Routine' };

export const sentimentLabel = (sentiment: NewsSentiment, impact: NewsImpact): string => `${TONE[sentiment]} · ${IMPACT[impact]}`;

/** Weights of priced holdings as percent of priced value; unpriced holdings carry no weight and are skipped. */
export function holdingWeights(holdings: readonly { symbol: string; quantity: number; ltp: number | null }[]): HeldWeight[] {
  const priced = holdings.filter((h): h is typeof h & { ltp: number } => h.ltp !== null);
  const total = priced.reduce((sum, h) => sum + h.quantity * h.ltp, 0);
  if (total <= 0) return [];
  return priced.map((h) => ({ symbol: h.symbol.toUpperCase(), weightPct: (h.quantity * h.ltp / total) * 100 }));
}
