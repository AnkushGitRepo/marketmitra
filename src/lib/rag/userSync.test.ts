import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserNote } from '@/lib/notes/userNotes';

const embedBatch = vi.fn<(t: string[]) => Promise<number[][]>>();
vi.mock('./embed', () => ({ embedBatch: (t: string[]) => embedBatch(t) }));

const replaceSourceChunks = vi.fn();
const deleteSourceChunks = vi.fn();
vi.mock('./chunks', () => ({
  replaceSourceChunks: (...a: unknown[]) => replaceSourceChunks(...a),
  deleteSourceChunks: (...a: unknown[]) => deleteSourceChunks(...a),
}));

const getEnrichedHoldings = vi.fn();
vi.mock('@/lib/dashboard/enrichedHoldings', () => ({
  getEnrichedHoldings: () => getEnrichedHoldings(),
}));

const { syncUserNote, removeUserNote, syncUserHoldings, resyncUserHoldings, noteSource } =
  await import('./userSync');

const note: UserNote = {
  id: 'n1',
  userId: 'u1',
  title: 'Why I hold TCS',
  body: 'Steady dividend, strong order book.',
  symbol: 'TCS',
  tickers: [],
  source: 'manual',
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-09-01'),
};

beforeEach(() => {
  embedBatch.mockReset().mockImplementation(async (texts) => texts.map(() => [0.1, 0.2]));
  replaceSourceChunks.mockReset().mockResolvedValue({ changed: true, written: 1, pruned: 0 });
  deleteSourceChunks.mockReset().mockResolvedValue(1);
});

describe('syncUserNote', () => {
  it('embeds title+body and upserts under note:<id> with note meta', async () => {
    expect(await syncUserNote('u1', note)).toBe(true);
    const [source, meta, windows] = replaceSourceChunks.mock.calls[0];
    expect(source).toBe('note:n1');
    expect(meta).toMatchObject({ docType: 'note', userId: 'u1', symbol: 'TCS', title: 'Why I hold TCS' });
    expect(windows[0].vector).toEqual([0.1, 0.2]);
  });

  it('returns false (never throws) when embedding fails', async () => {
    embedBatch.mockRejectedValue(new Error('model load failed'));
    expect(await syncUserNote('u1', note)).toBe(false);
  });
});

describe('removeUserNote', () => {
  it('deletes the note source', async () => {
    expect(await removeUserNote('n1')).toBe(true);
    expect(deleteSourceChunks).toHaveBeenCalledWith('note:n1');
  });
  it('swallows a delete error', async () => {
    deleteSourceChunks.mockRejectedValue(new Error('db down'));
    expect(await removeUserNote('n1')).toBe(false);
  });
});

describe('syncUserHoldings', () => {
  const h = { symbol: 'TCS', name: 'TCS', sector: 'IT', quantity: 2, avgPrice: 3000, ltp: 3200 };

  it('re-embeds a snapshot under holdings:<userId>', async () => {
    expect(await syncUserHoldings('u1', [h])).toBe(true);
    const [source, meta] = replaceSourceChunks.mock.calls[0];
    expect(source).toBe('holdings:u1');
    expect(meta).toMatchObject({ docType: 'holdings', userId: 'u1' });
  });

  it('clears the source when there are no holdings', async () => {
    expect(await syncUserHoldings('u1', [])).toBe(true);
    expect(deleteSourceChunks).toHaveBeenCalledWith('holdings:u1');
    expect(replaceSourceChunks).not.toHaveBeenCalled();
  });
});

describe('resyncUserHoldings', () => {
  it('fetches enriched holdings then re-embeds the snapshot', async () => {
    getEnrichedHoldings.mockResolvedValue([
      { symbol: 'TCS', name: 'TCS', sector: 'IT', quantity: 2, avgPrice: 3000, ltp: 3200 },
    ]);
    await resyncUserHoldings('u1');
    expect(replaceSourceChunks.mock.calls[0][0]).toBe('holdings:u1');
  });

  it('never throws when the fetch fails', async () => {
    getEnrichedHoldings.mockRejectedValue(new Error('fundamentals down'));
    await expect(resyncUserHoldings('u1')).resolves.toBeUndefined();
  });
});

describe('noteSource', () => {
  it('is stable', () => expect(noteSource('abc')).toBe('note:abc'));
});
