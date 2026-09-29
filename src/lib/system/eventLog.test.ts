import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = {
  _id: { toString: () => string };
  ts: Date;
  level: 'info' | 'warn' | 'error';
  source: string;
  message: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

let store: Doc[] = [];

function matches(doc: Doc, filter: Record<string, unknown>): boolean {
  if (filter.level && doc.level !== filter.level) return false;
  if (filter.source && doc.source !== filter.source) return false;
  const ts = filter.ts as { $lt: Date } | undefined;
  if (ts && !(doc.ts < ts.$lt)) return false;
  return true;
}

const fakeCol = {
  createIndexes: vi.fn(async () => undefined),
  insertOne: vi.fn(async (doc: Doc) => {
    store.push(doc);
    return { insertedId: doc._id };
  }),
  find: vi.fn((filter: Record<string, unknown> = {}) => ({
    sort: () => ({
      limit: (n: number) => ({
        toArray: async () =>
          [...store]
            .filter((d) => matches(d, filter))
            .sort((a, b) => b.ts.getTime() - a.ts.getTime())
            .slice(0, n),
      }),
    }),
  })),
};

vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => fakeCol }) }));

const { logEvent, listEvents, latestEventPerSource, ensureEventLogIndexes } = await import('./eventLog');

beforeEach(() => {
  store = [];
  vi.clearAllMocks();
});

describe('logEvent', () => {
  it('inserts a document and never throws on a store failure', async () => {
    await logEvent({ level: 'info', source: 'cron:evaluate-alerts', message: 'ran' });
    expect(store).toHaveLength(1);
    expect(store[0].level).toBe('info');

    fakeCol.insertOne.mockImplementationOnce(async () => {
      throw new Error('store down');
    });
    await expect(
      logEvent({ level: 'error', source: 'cron:evaluate-alerts', message: 'boom' })
    ).resolves.toBeUndefined();
  });
});

describe('listEvents', () => {
  it('filters by level and source, newest first, capped at limit', async () => {
    await logEvent({ level: 'info', source: 'a', message: '1' });
    await logEvent({ level: 'error', source: 'a', message: '2' });
    await logEvent({ level: 'info', source: 'b', message: '3' });

    const errors = await listEvents({ level: 'error' });
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('2');

    const sourceA = await listEvents({ source: 'a' });
    expect(sourceA.map((e) => e.message).sort()).toEqual(['1', '2']);

    const capped = await listEvents({ limit: 1 });
    expect(capped).toHaveLength(1);
  });

  it('clamps an out-of-range limit into [1, 200]', async () => {
    await logEvent({ level: 'info', source: 'a', message: '1' });
    await expect(listEvents({ limit: 0 })).resolves.toHaveLength(1);
    await expect(listEvents({ limit: 9999 })).resolves.toHaveLength(1);
  });
});

describe('latestEventPerSource', () => {
  it('returns the newest event per source, null when absent', async () => {
    // Real clock timestamps can tie within the same millisecond in a fast
    // test run, which makes "newest" ambiguous — force distinct ts values.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    await logEvent({ level: 'info', source: 'a', message: 'old' });
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    await logEvent({ level: 'info', source: 'a', message: 'new' });
    vi.useRealTimers();

    const result = await latestEventPerSource(['a', 'missing']);
    expect(result.a?.message).toBe('new');
    expect(result.missing).toBeNull();
  });
});

describe('ensureEventLogIndexes', () => {
  it('creates the ts, source+ts, and TTL indexes', async () => {
    await ensureEventLogIndexes();
    expect(fakeCol.createIndexes).toHaveBeenCalledWith([
      { key: { ts: -1 }, name: 'ts_desc' },
      { key: { source: 1, ts: -1 }, name: 'source_ts' },
      { key: { ts: 1 }, name: 'ttl', expireAfterSeconds: 30 * 86400 },
    ]);
  });
});
