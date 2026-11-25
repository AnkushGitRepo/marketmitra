// Corpus indexer for Phase 10 (ADR 0020) — builds the *shared* public
// retrieval corpus (`userId: null`). Runs as a scheduled job
// (`POST /api/cron/index-corpus`), never inline in a user request.
//
// This module owns the news path. Filing (annual-report / DRHP) indexing
// is layered on separately; it reuses `indexTextDocument` here.

import { getDocuments } from '@/lib/dashboard/fundamentalsApi';
import { getNews, type NewsItem } from '@/lib/dashboard/newsApi';
import { chunkText } from './chunk';
import {
  chunksCollection,
  ensureChunksIndexes,
  replaceSourceChunks,
  type ChunkMeta,
  type EnsureIndexesResult,
} from './chunks';
import { embedBatch } from './embed';
import { fetchPdfText } from './pdfTextClient';

/** Cap the windows embedded for one document so a 400-page DRHP can't blow
 *  a single cron run's time budget. */
const MAX_WINDOWS_PER_DOC = 400;
const EMBED_BATCH = 32;

/** Symbols whose annual-report filings feed the shared corpus. Overridable
 *  with `RAG_FILING_SYMBOLS` (comma-separated). A small default set that
 *  the indexer churns through a few at a time. */
const DEFAULT_FILING_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'HDFCBANK',
  'INFY',
  'ICICIBANK',
  'BHARTIARTL',
  'SBIN',
  'LT',
  'ITC',
  'HINDUNILVR',
];

function filingSymbols(override?: string[]): string[] {
  if (override && override.length > 0) return override.map((s) => s.toUpperCase());
  const env = process.env.RAG_FILING_SYMBOLS;
  if (env) {
    return env
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  return DEFAULT_FILING_SYMBOLS;
}

export interface IndexCorpusOptions {
  /** How many recent news items to (re)consider per run. Default 150. */
  newsLimit?: number;
  /** Prune news chunks whose publishedAt is older than this. Default 45. */
  newsRetentionDays?: number;
  /** Restrict/override the filing symbol set for this run. */
  filingSymbols?: string[];
  /** Max annual-report PDFs to fetch + embed per run (they're large). Default 3. */
  maxFilings?: number;
  /** Cap pages pulled from each filing PDF. Default 120. */
  filingMaxPages?: number;
  now?: Date;
}

export interface IndexCorpusResult {
  vectorIndex: EnsureIndexesResult['vectorIndex'];
  news: { seen: number; changed: number; pruned: number };
  filings: { seen: number; indexed: number; skipped: number };
  errors: string[];
}

/** Embed `windows` (in batches) and upsert them as the chunks for `source`. */
export async function indexTextDocument(
  source: string,
  meta: ChunkMeta,
  text: string
): Promise<{ changed: boolean; windows: number }> {
  const windows = chunkText(text).slice(0, MAX_WINDOWS_PER_DOC);
  if (windows.length === 0) {
    // Nothing extractable — drop any stale chunks for this source.
    await replaceSourceChunks(source, meta, []);
    return { changed: false, windows: 0 };
  }

  const vectors: number[][] = [];
  for (let i = 0; i < windows.length; i += EMBED_BATCH) {
    const batch = windows.slice(i, i + EMBED_BATCH).map((w) => w.text);
    vectors.push(...(await embedBatch(batch)));
  }

  const res = await replaceSourceChunks(
    source,
    meta,
    windows.map((w, i) => ({ chunkIndex: w.index, text: w.text, vector: vectors[i] }))
  );
  return { changed: res.changed, windows: windows.length };
}

function newsText(item: NewsItem): string {
  return [item.title, item.summary].filter((s): s is string => Boolean(s && s.trim())).join('\n\n');
}

function newsMeta(item: NewsItem): ChunkMeta {
  const published = new Date(item.published_at);
  return {
    docType: 'news',
    userId: null,
    symbol: item.symbols[0]?.toUpperCase() ?? null,
    sourceUrl: item.url,
    title: item.title,
    publishedAt: Number.isNaN(published.getTime()) ? null : published,
  };
}

/** The fundamentals-api `/news` route caps `limit` at 50, so pull in
 *  pages and follow `next_cursor` up to `total`. */
async function fetchRecentNews(total: number): Promise<NewsItem[]> {
  const PAGE = 50;
  const items: NewsItem[] = [];
  let cursor: string | null | undefined;
  while (items.length < total) {
    const page = await getNews({ limit: Math.min(PAGE, total - items.length), cursor, includeRegulatory: true });
    items.push(...page.items);
    cursor = page.next_cursor;
    if (!cursor || page.items.length === 0) break;
  }
  return items;
}

async function pruneOldNews(now: Date, retentionDays: number): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const col = await chunksCollection();
  const res = await col.deleteMany({ docType: 'news', publishedAt: { $lt: cutoff } });
  return res.deletedCount ?? 0;
}

/** An annual-report filing already indexed at this exact period_end needs
 *  no re-fetch — the PDF is immutable once filed. */
async function filingAlreadyIndexed(source: string, periodEnd: Date | null): Promise<boolean> {
  const col = await chunksCollection();
  const query = periodEnd ? { source, publishedAt: periodEnd } : { source };
  return (await col.findOne(query, { projection: { _id: 1 } })) !== null;
}

interface FilingsRun {
  seen: number;
  indexed: number;
  skipped: number;
  errors: string[];
}

async function indexFilings(
  symbols: string[],
  maxFilings: number,
  maxPages: number
): Promise<FilingsRun> {
  const run: FilingsRun = { seen: 0, indexed: 0, skipped: 0, errors: [] };

  for (const symbol of symbols) {
    if (run.indexed >= maxFilings) break;

    let docs;
    try {
      docs = await getDocuments(symbol);
    } catch (err) {
      run.errors.push(`filings ${symbol}: ${err instanceof Error ? err.message : 'list failed'}`);
      continue;
    }
    const annualReports = (docs ?? []).filter((d) =>
      d.document_type.toLowerCase().includes('annual')
    );
    // Newest period first.
    annualReports.sort((a, b) => (a.period_end ?? '').localeCompare(b.period_end ?? '')).reverse();

    for (const doc of annualReports.slice(0, 1)) {
      if (run.indexed >= maxFilings) break;
      run.seen += 1;

      const source = `filing:${symbol}:${doc.url}`;
      const periodEnd = doc.period_end ? new Date(doc.period_end) : null;
      const validPeriod = periodEnd && !Number.isNaN(periodEnd.getTime()) ? periodEnd : null;

      if (await filingAlreadyIndexed(source, validPeriod)) {
        run.skipped += 1;
        continue;
      }

      try {
        const pdf = await fetchPdfText(doc.url, { maxPages });
        if (!pdf || !pdf.text.trim()) {
          run.skipped += 1;
          continue;
        }
        const meta: ChunkMeta = {
          docType: 'filing',
          userId: null,
          symbol,
          sourceUrl: doc.url,
          title: doc.title,
          publishedAt: validPeriod,
        };
        const res = await indexTextDocument(source, meta, pdf.text);
        if (res.windows > 0) run.indexed += 1;
        else run.skipped += 1;
      } catch (err) {
        run.errors.push(`filing ${source}: ${err instanceof Error ? err.message : 'failed'}`);
      }
    }
  }

  return run;
}

export async function indexCorpus(options: IndexCorpusOptions = {}): Promise<IndexCorpusResult> {
  const now = options.now ?? new Date();
  const newsLimit = options.newsLimit ?? 150;
  const retentionDays = options.newsRetentionDays ?? 45;
  const errors: string[] = [];

  const indexes = await ensureChunksIndexes();
  if (indexes.vectorIndex === 'unavailable' && indexes.detail) {
    errors.push(`vector index unavailable: ${indexes.detail}`);
  }

  const newsItems = await fetchRecentNews(newsLimit);
  let changed = 0;
  for (const item of newsItems) {
    if (!item.url || !newsText(item)) continue;
    try {
      const res = await indexTextDocument(item.url, newsMeta(item), newsText(item));
      if (res.changed) changed += 1;
    } catch (err) {
      errors.push(`news ${item.url}: ${err instanceof Error ? err.message : 'failed'}`);
    }
  }

  let pruned = 0;
  try {
    pruned = await pruneOldNews(now, retentionDays);
  } catch (err) {
    errors.push(`prune: ${err instanceof Error ? err.message : 'failed'}`);
  }

  const filings = await indexFilings(
    filingSymbols(options.filingSymbols),
    options.maxFilings ?? 3,
    options.filingMaxPages ?? 120
  );
  errors.push(...filings.errors);

  return {
    vectorIndex: indexes.vectorIndex,
    news: { seen: newsItems.length, changed, pruned },
    filings: { seen: filings.seen, indexed: filings.indexed, skipped: filings.skipped },
    errors,
  };
}
