import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = {
  _id: { toString: () => string };
  userId: string;
  name: string;
  symbols: string[];
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
  findOneAndUpdate: vi.fn(async () => store[0] ?? null),
  deleteOne: vi.fn(async () => ({ deletedCount: 1 })),
};

vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => fakeCol }) }));

const { createWishlist, addSymbol, removeSymbol, MAX_NAME, MAX_SYMBOLS_PER_WISHLIST } = await import(
  './userWishlists'
);

const VALID_ID = '000000000000000000000001';

beforeEach(() => {
  store = [];
  count = 0;
  vi.clearAllMocks();
});

describe('createWishlist', () => {
  it('trims/truncates the name and starts with no symbols', async () => {
    const w = await createWishlist('u1', '  ' + 'x'.repeat(MAX_NAME + 20) + '  ');
    expect(w).not.toBeNull();
    expect(w!.name).toHaveLength(MAX_NAME);
    expect(w!.symbols).toEqual([]);
    expect(fakeCol.insertOne).toHaveBeenCalled();
  });

  it('refuses past the per-user cap', async () => {
    count = 20;
    expect(await createWishlist('u1', 'IT majors')).toBeNull();
    expect(fakeCol.insertOne).not.toHaveBeenCalled();
  });
});

describe('addSymbol', () => {
  it('returns null for a malformed id without hitting the db', async () => {
    expect(await addSymbol('u1', 'not-an-objectid', 'TCS')).toBeNull();
    expect(fakeCol.findOne).not.toHaveBeenCalled();
  });

  it('returns null when the wishlist is not the user\'s / does not exist', async () => {
    store = [];
    expect(await addSymbol('u1', VALID_ID, 'TCS')).toBeNull();
  });

  it('upper-cases the symbol and dedupes an already-present one without another db write', async () => {
    store = [
      { _id: { toString: () => VALID_ID }, userId: 'u1', name: 'W', symbols: ['TCS'], createdAt: new Date(), updatedAt: new Date() },
    ];
    const w = await addSymbol('u1', VALID_ID, 'tcs');
    expect(w!.symbols).toEqual(['TCS']);
    expect(fakeCol.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('refuses past the per-wishlist symbol cap', async () => {
    store = [
      {
        _id: { toString: () => VALID_ID },
        userId: 'u1',
        name: 'W',
        symbols: Array.from({ length: MAX_SYMBOLS_PER_WISHLIST }, (_, i) => `SYM${i}`),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    expect(await addSymbol('u1', VALID_ID, 'NEWONE')).toBeNull();
    expect(fakeCol.findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe('removeSymbol', () => {
  it('returns null for a malformed id without hitting the db', async () => {
    expect(await removeSymbol('u1', 'nope', 'TCS')).toBeNull();
    expect(fakeCol.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('$pulls the (upper-cased) symbol', async () => {
    store = [
      { _id: { toString: () => VALID_ID }, userId: 'u1', name: 'W', symbols: ['TCS'], createdAt: new Date(), updatedAt: new Date() },
    ];
    await removeSymbol('u1', VALID_ID, 'tcs');
    expect(fakeCol.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: expect.anything(), userId: 'u1' },
      expect.objectContaining({ $pull: { symbols: 'TCS' } }),
      expect.anything()
    );
  });
});
