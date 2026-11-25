// Client for services/fundamentals-api's GET /news (ADR 0015). Consumed
// from Server Components, same as the rest of fundamentalsApi.ts. Returns
// an empty page on failure — callers render an honest empty state.

const BASE_URL = process.env.FUNDAMENTALS_API_URL ?? 'http://localhost:8420';

export type NewsSentiment = 'positive' | 'neutral' | 'negative';

export interface NewsItem {
  url: string;
  title: string;
  summary: string | null;
  source: string;
  published_at: string;
  sentiment: NewsSentiment;
  sentiment_score: number;
  symbols: string[];
}

export interface NewsPage {
  items: NewsItem[];
  next_cursor: string | null;
}

const EMPTY: NewsPage = { items: [], next_cursor: null };

export async function getNews(opts: {
  symbols?: string[];
  limit?: number;
  cursor?: string | null;
  /** Also return regulator notices (RBI, TRAI, SEBI). Off for the news page; on for the retrieval indexer (#365). */
  includeRegulatory?: boolean;
} = {}): Promise<NewsPage> {
  const params = new URLSearchParams();
  if (opts.symbols?.length) params.set('symbols', opts.symbols.join(','));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.includeRegulatory) params.set('include_regulatory', 'true');

  try {
    const response = await fetch(`${BASE_URL}/news?${params.toString()}`, {
      // News is refreshed server-side by the Python service's own TTL; a
      // short Next cache keeps repeated dashboard loads cheap.
      next: { revalidate: 300 },
    });
    if (!response.ok) return EMPTY;
    return (await response.json()) as NewsPage;
  } catch {
    return EMPTY;
  }
}
