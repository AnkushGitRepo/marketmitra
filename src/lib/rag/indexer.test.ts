import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { DocumentOut } from '@/lib/dashboard/fundamentalsApi';

const getNews = vi.fn<(opts?: { includeRegulatory?: boolean }) => Promise<{ items: NewsItem[]; next_cursor: string | null }>>();
vi.mock('@/lib/dashboard/newsApi', () => ({ getNews: (opts?: { includeRegulatory?: boolean }) => getNews(opts) }));

const getDocuments = vi.fn<(s: string) => Promise<DocumentOut[] | null>>();
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({ getDocuments: (s: string) => getDocuments(s) }));

const fetchPdfText =
  vi.fn<(u: string, o?: unknown) => Promise<{ text: string; pageCount: number; bytes: number } | null>>();
vi.mock('./pdfTextClient', () => ({ fetchPdfText: (u: string, o?: unknown) => fetchPdfText(u, o) }));

const embedBatch = vi.fn<(t: string[]) => Promise<number[][]>>();
vi.mock('./embed', () => ({ embedBatch: (t: string[]) => embedBatch(t) }));

const ensureChunksIndexes = vi.fn();
const replaceSourceChunks = vi.fn();
const deleteMany = vi.fn<(f: unknown) => Promise<{ deletedCount: number }>>();
const findOne = vi.fn<(q: unknown, o?: unknown) => Promise<unknown>>();
vi.mock('./chunks', () => ({
  ensureChunksIndexes: () => ensureChunksIndexes(),
  replaceSourceChunks: (...a: unknown[]) => replaceSourceChunks(...a),
  chunksCollection: async () => ({ deleteMany, findOne }),
}));

const { indexCorpus, indexTextDocument } = await import('./indexer');

const doc = (over: Partial<DocumentOut> = {}): DocumentOut => ({
  document_type: 'Annual Report',
  title: 'Annual Report 2026',
  url: 'https://bse/reliance-ar-2026.pdf',
  period_end: '2026-03-31',
  source_tier: 'tier3_screener',
  ...over,
});

const item = (over: Partial<NewsItem> = {}): NewsItem => ({
  url: 'https://ex.com/a',
  title: 'Reliance Q2 profit rises 10%',
  summary: 'The company reported higher refining margins.',
  source: 'Example',
  published_at: '2026-09-01T00:00:00.000Z',
  sentiment: 'positive',
  sentiment_score: 0.5,
  symbols: ['RELIANCE'],
  ...over,
});

beforeEach(() => {
  getNews.mockReset();
  getDocuments.mockReset();
  fetchPdfText.mockReset();
  embedBatch.mockReset();
  ensureChunksIndexes.mockReset();
  replaceSourceChunks.mockReset();
  deleteMany.mockReset();
  findOne.mockReset();

  ensureChunksIndexes.mockResolvedValue({ vectorIndex: 'exists' });
  embedBatch.mockImplementation(async (texts) => texts.map(() => [0.1, 0.2, 0.3]));
  replaceSourceChunks.mockResolvedValue({ changed: true, written: 1, pruned: 0 });
  deleteMany.mockResolvedValue({ deletedCount: 0 });
  findOne.mockResolvedValue(null);
  getDocuments.mockResolvedValue([]); // no filings unless a test opts in
  fetchPdfText.mockResolvedValue({ text: 'Filing body. More text.', pageCount: 10, bytes: 999 });
});

describe('indexTextDocument', () => {
  it('chunks, embeds, and upserts under the given source + meta', async () => {
    const meta = { docType: 'news' as const, userId: null, symbol: 'RELIANCE' };
    const res = await indexTextDocument('src-1', meta, 'A sentence. Another sentence.');
    expect(res.windows).toBe(1);
    expect(res.changed).toBe(true);
    const [source, passedMeta, windows] = replaceSourceChunks.mock.calls[0];
    expect(source).toBe('src-1');
    expect(passedMeta).toBe(meta);
    expect(windows[0]).toMatchObject({ chunkIndex: 0, vector: [0.1, 0.2, 0.3] });
  });

  it('clears stale chunks and embeds nothing for empty text', async () => {
    const res = await indexTextDocument('src-2', { docType: 'filing', userId: null }, '   ');
    expect(res).toEqual({ changed: false, windows: 0 });
    expect(embedBatch).not.toHaveBeenCalled();
    expect(replaceSourceChunks).toHaveBeenCalledWith('src-2', expect.anything(), []);
  });
});

describe('indexCorpus', () => {
  it('asks the news service for regulator notices too, so the report can retrieve them (#365)', async () => {
    getNews.mockResolvedValue({ items: [], next_cursor: null });
    await indexCorpus({ now: new Date('2026-09-06T00:00:00Z') });
    expect(getNews).toHaveBeenCalledWith(expect.objectContaining({ includeRegulatory: true }));
  });

  it('ensures indexes, indexes each news item, and reports counts', async () => {
    getNews.mockResolvedValue({ items: [item(), item({ url: 'https://ex.com/b' })], next_cursor: null });
    const res = await indexCorpus({ now: new Date('2026-09-06T00:00:00Z') });

    expect(ensureChunksIndexes).toHaveBeenCalled();
    expect(res.news).toEqual({ seen: 2, changed: 2, pruned: 0 });
    expect(res.vectorIndex).toBe('exists');
    expect(res.errors).toEqual([]);

    const firstMeta = replaceSourceChunks.mock.calls[0][1];
    expect(firstMeta).toMatchObject({ docType: 'news', userId: null, symbol: 'RELIANCE' });
    expect(firstMeta.publishedAt).toBeInstanceOf(Date);
  });

  it('pages through news past the 50-item /news cap, following next_cursor', async () => {
    getNews
      .mockResolvedValueOnce({ items: [item(), item({ url: 'https://ex.com/b' })], next_cursor: 'c1' })
      .mockResolvedValueOnce({ items: [item({ url: 'https://ex.com/c' })], next_cursor: null });
    const res = await indexCorpus({ newsLimit: 120 });
    expect(getNews).toHaveBeenCalledTimes(2);
    expect(res.news.seen).toBe(3);
  });

  it('skips items with no url or no text, without counting them as changed', async () => {
    getNews.mockResolvedValue({
      items: [item({ url: '' }), item({ title: '', summary: null })],
      next_cursor: null,
    });
    const res = await indexCorpus();
    expect(res.news.changed).toBe(0);
    expect(replaceSourceChunks).not.toHaveBeenCalled();
  });

  it('collects a per-item error and still finishes the run', async () => {
    getNews.mockResolvedValue({ items: [item(), item({ url: 'https://ex.com/b' })], next_cursor: null });
    replaceSourceChunks.mockRejectedValueOnce(new Error('write failed'));
    const res = await indexCorpus();
    expect(res.news.changed).toBe(1);
    expect(res.errors[0]).toContain('write failed');
  });

  it('prunes news chunks older than the retention window', async () => {
    getNews.mockResolvedValue({ items: [], next_cursor: null });
    deleteMany.mockResolvedValue({ deletedCount: 7 });
    const res = await indexCorpus({ now: new Date('2026-09-06T00:00:00Z'), newsRetentionDays: 30 });
    expect(res.news.pruned).toBe(7);
    const filter = deleteMany.mock.calls[0][0] as { docType: string; publishedAt: { $lt: Date } };
    expect(filter.docType).toBe('news');
    expect(filter.publishedAt.$lt.toISOString()).toBe('2026-08-07T00:00:00.000Z');
  });

  it('surfaces an unavailable vector index as a non-fatal error', async () => {
    ensureChunksIndexes.mockResolvedValue({ vectorIndex: 'unavailable', detail: 'not Atlas' });
    getNews.mockResolvedValue({ items: [], next_cursor: null });
    const res = await indexCorpus();
    expect(res.vectorIndex).toBe('unavailable');
    expect(res.errors[0]).toContain('not Atlas');
  });
});

describe('indexCorpus — filings', () => {
  beforeEach(() => {
    getNews.mockResolvedValue({ items: [], next_cursor: null });
  });

  it('fetches, extracts, and indexes the latest annual report per symbol', async () => {
    getDocuments.mockImplementation(async (s) =>
      s === 'RELIANCE'
        ? [doc({ period_end: '2025-03-31' }), doc({ url: 'https://bse/r-2026.pdf', period_end: '2026-03-31' })]
        : []
    );
    const res = await indexCorpus({ filingSymbols: ['RELIANCE'], maxFilings: 3 });

    expect(res.filings).toEqual({ seen: 1, indexed: 1, skipped: 0 });
    expect(fetchPdfText).toHaveBeenCalledWith('https://bse/r-2026.pdf', { maxPages: 120 });
    const [source, meta] = replaceSourceChunks.mock.calls.at(-1)!;
    expect(source).toBe('filing:RELIANCE:https://bse/r-2026.pdf');
    expect(meta).toMatchObject({ docType: 'filing', userId: null, symbol: 'RELIANCE' });
    expect(meta.publishedAt).toEqual(new Date('2026-03-31'));
  });

  it('skips a filing already indexed at that period_end without fetching it', async () => {
    getDocuments.mockImplementation(async (s) => (s === 'TCS' ? [doc({ period_end: '2026-03-31' })] : []));
    findOne.mockResolvedValue({ _id: 'x' });
    const res = await indexCorpus({ filingSymbols: ['TCS'] });
    expect(res.filings).toEqual({ seen: 1, indexed: 0, skipped: 1 });
    expect(fetchPdfText).not.toHaveBeenCalled();
  });

  it('stops after maxFilings even with more symbols available', async () => {
    getDocuments.mockResolvedValue([doc()]);
    const res = await indexCorpus({ filingSymbols: ['A', 'B', 'C', 'D'], maxFilings: 2 });
    expect(res.filings.indexed).toBe(2);
  });

  it('records an error and continues when a PDF fetch throws', async () => {
    getDocuments.mockResolvedValue([doc()]);
    fetchPdfText.mockRejectedValueOnce(new Error('extract-text 502'));
    const res = await indexCorpus({ filingSymbols: ['ONE', 'TWO'], maxFilings: 3 });
    expect(res.errors.some((e) => e.includes('extract-text 502'))).toBe(true);
    expect(res.filings.indexed).toBe(1); // the second symbol still processed
  });

  it('treats no extractable text as skipped', async () => {
    getDocuments.mockResolvedValue([doc()]);
    fetchPdfText.mockResolvedValue(null);
    const res = await indexCorpus({ filingSymbols: ['X'] });
    expect(res.filings).toEqual({ seen: 1, indexed: 0, skipped: 1 });
  });
});
