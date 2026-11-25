import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = {
  _id: { toString: () => string };
  userId: string;
  title: string;
  body: string;
  symbol: string | null;
  tickers?: string[];
  source?: 'manual' | 'research';
  createdAt: Date;
  updatedAt: Date;
};

let store: Doc[] = [];
let count = 0;

const fakeCol = {
  find: vi.fn(() => ({
    sort: () => ({ toArray: async () => store }),
  })),
  findOne: vi.fn(async () => store[0] ?? null),
  countDocuments: vi.fn(async () => count),
  insertOne: vi.fn(async (doc: Doc) => {
    store.push(doc);
    return { insertedId: doc._id };
  }),
  findOneAndUpdate: vi.fn(async (...args: unknown[]): Promise<Doc | null> => {
    void args;
    return store[0] ?? null;
  }),
  deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
};

vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => fakeCol }) }));

const { createNote, updateNote, deleteNote, MAX_TITLE, MAX_BODY, MAX_RESEARCH_BODY } = await import('./userNotes');

beforeEach(() => {
  store = [];
  count = 0;
  vi.clearAllMocks();
});

describe('createNote', () => {
  it('trims/truncates fields and upper-cases the symbol', async () => {
    const note = await createNote('u1', {
      title: '  ' + 'x'.repeat(MAX_TITLE + 50) + '  ',
      body: '  hello  ',
      symbol: ' reliance ',
    });
    expect(note).not.toBeNull();
    expect(note!.title).toHaveLength(MAX_TITLE);
    expect(note!.body).toBe('hello');
    expect(note!.symbol).toBe('RELIANCE');
    expect(fakeCol.insertOne).toHaveBeenCalled();
  });

  it('nulls an empty symbol', async () => {
    const note = await createNote('u1', { title: 't', body: 'b', symbol: '   ' });
    expect(note!.symbol).toBeNull();
  });

  it('refuses past the per-user cap', async () => {
    count = 200;
    expect(await createNote('u1', { title: 't', body: 'b' })).toBeNull();
    expect(fakeCol.insertOne).not.toHaveBeenCalled();
  });

  it('caps the body length', async () => {
    const note = await createNote('u1', { title: 't', body: 'y'.repeat(MAX_BODY + 100) });
    expect(note!.body).toHaveLength(MAX_BODY);
  });
});

describe('saved research notes', () => {
  it('defaults to a manual note with no tickers', async () => {
    const note = await createNote('u1', { title: 't', body: 'b' });
    expect(note).toMatchObject({ source: 'manual', tickers: [] });
  });

  it('keeps the source and cleans the tickers', async () => {
    const note = await createNote('u1', { title: 't', body: 'b', source: 'research', tickers: [' idea ', 'JPL', 'IDEA', ''] });
    expect(note).toMatchObject({ source: 'research', tickers: ['IDEA', 'JPL'] });
  });

  it('gives a research note room for its tables, and a manual note not', async () => {
    const research = await createNote('u1', { title: 't', body: 'z'.repeat(MAX_RESEARCH_BODY + 10), source: 'research' });
    expect(research!.body).toHaveLength(MAX_RESEARCH_BODY);
    const manual = await createNote('u1', { title: 't', body: 'z'.repeat(MAX_RESEARCH_BODY), source: 'manual' });
    expect(manual!.body).toHaveLength(MAX_BODY);
  });

  it('reads a note stored before these fields existed as manual with no tickers', async () => {
    store.push({ _id: { toString: () => '000000000000000000000001' }, userId: 'u1', title: 'old', body: 'b', symbol: null, createdAt: new Date(), updatedAt: new Date() });
    const [first] = await (await import('./userNotes')).listNotes('u1');
    expect(first).toMatchObject({ source: 'manual', tickers: [] });
  });

  it('applies the size limit of the stored source when a note is edited', async () => {
    store.push({ _id: { toString: () => '000000000000000000000001' }, userId: 'u1', title: 'r', body: 'b', symbol: null, source: 'research', createdAt: new Date(), updatedAt: new Date() });
    fakeCol.findOneAndUpdate.mockImplementationOnce(async (_filter: unknown, update: unknown) => ({ ...store[0], ...(update as { $set: Partial<Doc> }).$set }));
    const note = await updateNote('u1', '000000000000000000000001', { title: 'r', body: 'q'.repeat(MAX_BODY + 500) });
    expect(note!.body).toHaveLength(MAX_BODY + 500);
  });

  it('returns null when the note to edit does not exist', async () => {
    expect(await updateNote('u1', '000000000000000000000001', { title: 't', body: 'b' })).toBeNull();
    expect(fakeCol.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('updateNote / deleteNote', () => {
  it('return null / false for a malformed id without hitting the db', async () => {
    expect(await updateNote('u1', 'not-an-objectid', { title: 't', body: 'b' })).toBeNull();
    expect(await deleteNote('u1', 'nope')).toBe(false);
    expect(fakeCol.findOneAndUpdate).not.toHaveBeenCalled();
    expect(fakeCol.deleteOne).not.toHaveBeenCalled();
  });

  it('delete returns true when a row was removed', async () => {
    expect(await deleteNote('u1', '000000000000000000000001')).toBe(true);
    expect(fakeCol.deleteOne).toHaveBeenCalledWith({
      _id: expect.anything(),
      userId: 'u1',
    });
  });
});
