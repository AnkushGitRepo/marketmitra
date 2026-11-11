// The free, deterministic half of an analyst's daily check (#128). It decides whether anything is worth a journal entry, so a quiet day
// costs nothing and the AI is only asked about events that actually happened. Pure.

import type { Bar } from '@/lib/chart/bars';
import type { Range52 } from '@/lib/stock/range52';
import type { MaterialEvent, WatchState } from './types';

export interface EventInputs {
  symbol: string;
  /** Daily bars, oldest first. */
  bars: readonly Bar[];
  range52: Range52 | null;
  news: ReadonlyArray<{ url: string; title: string; published_at: string; sentiment: 'positive' | 'neutral' | 'negative' }>;
  documents: ReadonlyArray<{ title: string; url: string }>;
  /** Latest quarterly figures from the peer table, or null when unavailable. */
  results: { netProfitQtr: number | null; qtrProfitVarPct: number | null; qtrSalesVarPct: number | null } | null;
  watch: WatchState;
}

export const THRESHOLDS = {
  priceMovePct: 4,
  priceHighPct: 8,
  volumeMultiple: 2,
  volumeWindow: 20,
  nearRangePct: 1,
  newsMinItems: 2,
  maxRemembered: 200,
} as const;

const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const signed = (n: number, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;

function remember(old: readonly string[], fresh: readonly string[]): string[] {
  return [...new Set([...old, ...fresh])].slice(-THRESHOLDS.maxRemembered);
}

function resultsKey(r: NonNullable<EventInputs['results']>): string {
  return [r.netProfitQtr, r.qtrProfitVarPct, r.qtrSalesVarPct].join('|');
}

export function detectEvents(i: EventInputs): { events: MaterialEvent[]; nextWatch: WatchState } {
  const events: MaterialEvent[] = [];
  const bars = i.bars.filter((b) => Number.isFinite(b.close));
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const day = last?.time ?? 'today';

  // Price move
  if (last && prev && prev.close > 0) {
    const pct = (last.close / prev.close - 1) * 100;
    if (Math.abs(pct) >= THRESHOLDS.priceMovePct) {
      events.push({
        key: `price:${day}`,
        kind: 'price',
        title: `${i.symbol} moved ${signed(pct)}% to ${inr(last.close)}`,
        facts: [`Previous close ${inr(prev.close)}, latest close ${inr(last.close)} (${signed(pct, 2)}%).`],
        alert: Math.abs(pct) >= THRESHOLDS.priceHighPct ? 'high' : 'medium',
      });
    }
  }

  // Volume spike against the prior 20 sessions
  if (last && bars.length > THRESHOLDS.volumeWindow) {
    const window = bars.slice(-(THRESHOLDS.volumeWindow + 1), -1);
    const avg = window.reduce((s, b) => s + b.volume, 0) / window.length;
    if (avg > 0 && last.volume / avg >= THRESHOLDS.volumeMultiple) {
      const m = last.volume / avg;
      events.push({
        key: `volume:${day}`,
        kind: 'volume',
        title: `${i.symbol} traded ${m.toFixed(1)}x its 20-day average volume`,
        facts: [`Volume ${last.volume.toLocaleString('en-IN')} against a 20-day average of ${Math.round(avg).toLocaleString('en-IN')}.`],
        alert: 'low',
      });
    }
  }

  // 52-week range: report entering the zone once
  let atHigh = false;
  let atLow = false;
  if (last && i.range52 && i.range52.high > i.range52.low) {
    const { low, high } = i.range52;
    atHigh = last.close >= high * (1 - THRESHOLDS.nearRangePct / 100);
    atLow = last.close <= low * (1 + THRESHOLDS.nearRangePct / 100);
    if (atHigh && !i.watch.atRangeHigh) {
      events.push({ key: `high:${day}`, kind: 'range', title: `${i.symbol} is at its 52-week high`, facts: [`Close ${inr(last.close)} against a 52-week high of ${inr(high)}.`], alert: 'low' });
    }
    if (atLow && !i.watch.atRangeLow) {
      events.push({ key: `low:${day}`, kind: 'range', title: `${i.symbol} is at its 52-week low`, facts: [`Close ${inr(last.close)} against a 52-week low of ${inr(low)}.`], alert: 'medium' });
    }
  }

  // News not seen before
  const seenNews = new Set(i.watch.seenNewsUrls);
  const freshNews = i.news.filter((n) => !seenNews.has(n.url));
  const hasNegative = freshNews.some((n) => n.sentiment === 'negative');
  if (freshNews.length >= THRESHOLDS.newsMinItems || hasNegative) {
    events.push({
      key: `news:${freshNews.map((n) => n.url).join(',')}`,
      kind: 'news',
      title: `${freshNews.length} new headline${freshNews.length === 1 ? '' : 's'} on ${i.symbol}`,
      facts: freshNews.slice(0, 5).map((n) => `[${n.sentiment}] ${n.title}`),
      alert: hasNegative ? 'medium' : 'low',
    });
  }

  // Filings: the first look is a baseline, later ones are news
  const seenDocs = new Set(i.watch.seenDocUrls);
  const freshDocs = i.documents.filter((d) => !seenDocs.has(d.url));
  if (i.watch.seenDocUrls.length > 0 && freshDocs.length > 0) {
    events.push({
      key: `filing:${freshDocs.map((d) => d.url).join(',')}`,
      kind: 'filing',
      title: `New filing: ${freshDocs[0].title}`,
      facts: freshDocs.slice(0, 3).map((d) => d.title),
      alert: 'low',
    });
  }

  // Results: a change against a stored baseline
  let nextResultsKey = i.watch.resultsKey;
  if (i.results) {
    nextResultsKey = resultsKey(i.results);
    if (i.watch.resultsKey !== null && i.watch.resultsKey !== nextResultsKey) {
      const r = i.results;
      events.push({
        key: `earnings:${nextResultsKey}`,
        kind: 'earnings',
        title: `${i.symbol} has new quarterly results`,
        facts: [
          r.netProfitQtr !== null ? `Net profit for the quarter ₹${r.netProfitQtr.toLocaleString('en-IN')} Cr.` : '',
          r.qtrProfitVarPct !== null ? `Profit ${signed(r.qtrProfitVarPct)}% year on year.` : '',
          r.qtrSalesVarPct !== null ? `Sales ${signed(r.qtrSalesVarPct)}% year on year.` : '',
        ].filter(Boolean),
        alert: 'medium',
      });
    }
  }

  return {
    events,
    nextWatch: {
      seenNewsUrls: remember(i.watch.seenNewsUrls, i.news.map((n) => n.url)),
      seenDocUrls: remember(i.watch.seenDocUrls, i.documents.map((d) => d.url)),
      resultsKey: nextResultsKey,
      atRangeHigh: atHigh,
      atRangeLow: atLow,
    },
  };
}
