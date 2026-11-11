// Builders for the *user-content* half of each insight prompt (the system
// half lives in prompts.ts). Kept pure + separate so the exact input that
// gets hashed for caching is easy to see.

import type { CompanyOut, RatioOut } from '@/lib/dashboard/fundamentalsApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { Ipo } from '@/lib/dashboard/iposApi';
import type { GroundingPassage } from '@/lib/rag/insightContext';

const money = (n: number | null | undefined) => (n == null ? '—' : `₹${n.toLocaleString('en-IN')}`);

/** Render retrieval grounding (Phase 10 / ADR 0020) as a prompt block, or
 *  '' when there is none. Kept here so the hashed input and the prompt
 *  text stay in lockstep. */
function groundingBlock(passages: GroundingPassage[] | undefined, heading: string): string {
  if (!passages || passages.length === 0) return '';
  return `\n${heading}:\n${passages.map((p) => `- (${p.source}) ${p.text}`).join('\n')}`;
}

export interface StockInsightInput {
  symbol: string;
  company: Pick<CompanyOut, 'name' | 'sector' | 'industry' | 'about'>;
  ratios: Pick<RatioOut, 'name' | 'value' | 'unit'>[];
  latestClose: number | null;
  financialsSummary: { label: string; latest: string | null; prior: string | null }[];
  shareholdingLatest: { category: string; percentage: string }[];
  news: Pick<NewsItem, 'title' | 'sentiment' | 'published_at'>[];
  grounding?: GroundingPassage[];
}

export function buildStockPrompt(i: StockInsightInput): string {
  const ratios = i.ratios.map((r) => `${r.name}: ${r.value ?? '—'}${r.unit ? ` ${r.unit}` : ''}`).join('; ');
  const fin = i.financialsSummary
    .map((f) => `${f.label}: ${f.latest ?? '—'} (prior ${f.prior ?? '—'})`)
    .join('; ');
  const sh = i.shareholdingLatest.map((s) => `${s.category} ${s.percentage}%`).join(', ');
  const news = i.news.length
    ? i.news.map((n) => `- [${n.sentiment}] ${n.title}`).join('\n')
    : '(no recent headlines)';

  return [
    `Company: ${i.company.name} (${i.symbol}), ${i.company.sector ?? 'sector n/a'} / ${i.company.industry ?? 'industry n/a'}.`,
    i.company.about ? `About: ${i.company.about}` : '',
    `Last close: ${money(i.latestClose)}.`,
    `Key ratios: ${ratios || '(none available)'}.`,
    `Recent financials: ${fin || '(none available)'}.`,
    `Latest shareholding: ${sh || '(none available)'}.`,
    `Recent news:\n${news}`,
    groundingBlock(i.grounding, 'Retrieved context (indexed news / filings)'),
  ]
    .filter(Boolean)
    .join('\n');
}

export interface PortfolioInsightInput {
  holdings: Pick<EnrichedHolding, 'symbol' | 'name' | 'sector' | 'quantity' | 'avgPrice' | 'ltp'>[];
  grounding?: GroundingPassage[];
}

export interface IpoInsightInput {
  ipo: Pick<
    Ipo,
    | 'name'
    | 'category'
    | 'status'
    | 'price'
    | 'ipo_size_cr'
    | 'lot_size'
    | 'subscription_times'
    | 'gmp'
    | 'gmp_pct'
    | 'open_date'
    | 'close_date'
    | 'listing_date'
    | 'anchor'
  >;
  drhpExtract?: string | null;
  grounding?: GroundingPassage[];
}

