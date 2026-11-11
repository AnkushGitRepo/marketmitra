import { beforeEach, describe, expect, it, vi } from 'vitest';

type Doc = Record<string, unknown> & { _id: { toString: () => string } };
const tables: Record<string, Doc[]> = {};
const match = (d: Doc, f: Record<string, unknown>) => Object.entries(f).every(([k, v]) => (k === '_id' ? String(d._id) === String(v) : d[k] === v));

const col = (name: string) => ({
  createIndexes: vi.fn(async () => undefined),
  findOne: vi.fn(async (f: Record<string, unknown>) => (tables[name] ?? []).find((d) => match(d, f)) ?? null),
  countDocuments: vi.fn(async (f: Record<string, unknown>) => (tables[name] ?? []).filter((d) => match(d, f)).length),
  insertOne: vi.fn(async (d: Doc) => void (tables[name] ??= []).push(d)),
  updateOne: vi.fn(async (f: Record<string, unknown>, u: { $set: Record<string, unknown> }) => {
    const d = (tables[name] ?? []).find((x) => match(x, f));
    if (d) Object.assign(d, u.$set);
    return { modifiedCount: d ? 1 : 0 };
  }),
  deleteOne: vi.fn(async (f: Record<string, unknown>) => {
    const i = (tables[name] ?? []).findIndex((x) => match(x, f));
    if (i >= 0) tables[name].splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }),
  deleteMany: vi.fn(async () => undefined),
  find: vi.fn((f: Record<string, unknown>) => {
    let rows = (tables[name] ?? []).filter((d) => match(d, f));
    const chain = {
      sort: (s: Record<string, number>) => {
        const [k, dir] = Object.entries(s)[0];
        rows = [...rows].sort((a, b) => ((a[k] as Date | null)?.getTime?.() ?? 0) - ((b[k] as Date | null)?.getTime?.() ?? 0) || 0).map((x) => x);
        if (dir < 0) rows.reverse();
        return chain;
      },
      limit: (n: number) => {
        rows = rows.slice(0, n);
        return chain;
      },
      toArray: async () => rows,
    };
    return chain;
  }),
});
vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: (n: string) => col(n) }) }));

const store = await import('./store');
const NOW = new Date('2026-11-11T11:00:00Z');

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
});

describe('spawnAnalyst', () => {
  it('creates an initializing analyst once and returns the existing one on a second call', async () => {
    const a = await store.spawnAnalyst('u1', 'acc', 'holding', NOW);
    expect(a).toMatchObject({ symbol: 'ACC', status: 'initializing', source: 'holding' });
    await store.spawnAnalyst('u1', 'ACC', 'watcher', NOW);
    expect(tables.stockAnalysts).toHaveLength(1);
    expect((await store.getAnalyst('u1', 'acc'))?.source).toBe('holding');
  });
  it('stops at the per-user analyst limit', async () => {
    for (let i = 0; i < store.MAX_ANALYSTS_PER_USER; i++) await store.spawnAnalyst('u1', `S${i}`, 'holding', NOW);
    expect(await store.spawnAnalyst('u1', 'ONEMORE', 'holding', NOW)).toBeNull();
    expect(await store.spawnAnalyst('u2', 'ONEMORE', 'holding', NOW)).not.toBeNull();
  });
});

describe('dossier and status', () => {
  it('saving a dossier makes the analyst active and clears any note', async () => {
    await store.spawnAnalyst('u1', 'ACC', 'holding', NOW);
    await store.setStatus('u1', 'ACC', 'initializing', 'Waiting for an AI key.', NOW);
    await store.saveDossier('u1', 'ACC', { summary: 's', business: 'b', strengths: [], vulnerabilities: [], notAvailable: [], generatedAt: '', model: '' }, { seenNewsUrls: [], seenDocUrls: [], resultsKey: null, atRangeHigh: false, atRangeLow: false }, NOW);
    expect(await store.getAnalyst('u1', 'ACC')).toMatchObject({ status: 'active', statusNote: null, lastCheckedAt: NOW });
  });
});

describe('unexpected failures (#148)', () => {
  const stall = async (user: string, symbol: string, note: string) => {
    await store.spawnAnalyst(user, symbol, 'holding', NOW);
    await store.setStatus(user, symbol, 'error', note, NOW);
  };
  it('re-queues an analyst after an unexpected failure, then stalls it once the attempts are used up, and a built dossier resets the count', async () => {
    await store.spawnAnalyst('u1', 'ACC', 'holding', NOW);
    expect(await store.markFailure('u1', 'ACC', NOW)).toBe('initializing');
    expect(await store.markFailure('u1', 'ACC', NOW)).toBe('initializing');
    expect(await store.markFailure('u1', 'ACC', NOW)).toBe('error');
    expect(await store.getAnalyst('u1', 'ACC')).toMatchObject({ status: 'error', retryCount: 3 });
    await store.saveDossier('u1', 'ACC', { summary: 's', business: 'b', strengths: [], vulnerabilities: [], notAvailable: [], generatedAt: '', model: '' }, { seenNewsUrls: [], seenDocUrls: [], resultsKey: null, atRangeHigh: false, atRangeLow: false }, NOW);
    expect(await store.getAnalyst('u1', 'ACC')).toMatchObject({ status: 'active', retryCount: 0 });
    expect(await store.markFailure('u1', 'NOPE', NOW)).toBeNull();
  });
  it('re-queues analysts left stalled by the old catch-all, but not provider or data errors, and only for the scoped user', async () => {
    await stall('u1', 'ACC', 'The analyst hit an unexpected error. Resume it to try again.');
    await stall('u1', 'PNB', 'The AI provider returned an error: quota');
    await stall('u2', 'TCS', 'The analyst hit an unexpected error. Resume it to try again.');
    expect(await store.requeueRetryable('u1', NOW)).toBe(1);
    expect(await store.getAnalyst('u1', 'ACC')).toMatchObject({ status: 'initializing', retryCount: 1 });
    expect((await store.getAnalyst('u1', 'ACC'))?.statusNote).toMatch(/Retrying after a temporary error/);
    expect((await store.getAnalyst('u1', 'PNB'))?.status).toBe('error');
    expect((await store.getAnalyst('u2', 'TCS'))?.status).toBe('error');
    expect(await store.requeueRetryable(undefined, NOW)).toBe(1);
    expect((await store.getAnalyst('u2', 'TCS'))?.status).toBe('initializing');
  });
  it('gives up after the retry limit instead of looping forever', async () => {
    await stall('u1', 'ACC', 'The analyst hit an unexpected error. Resume it to try again.');
    for (let i = 0; i < 3; i++) {
      expect(await store.requeueRetryable('u1', NOW)).toBe(1);
      await store.setStatus('u1', 'ACC', 'error', 'The analyst hit an unexpected error. Resume it to try again.', NOW);
    }
    expect(await store.requeueRetryable('u1', NOW)).toBe(0);
  });
});

describe('requeueStalled (#149)', () => {
  it("re-queues only this user's stalled analysts: built ones and other users' are left alone", async () => {
    await store.spawnAnalyst('u1', 'ACC', 'holding', NOW);
    await store.setStatus('u1', 'ACC', 'error', 'The AI provider returned an error: quota', NOW);
    await store.spawnAnalyst('u1', 'PNB', 'holding', NOW);
    await store.setStatus('u1', 'PNB', 'error', 'The analyst hit an unexpected error several times in a row.', NOW);
    await store.spawnAnalyst('u1', 'TCS', 'holding', NOW);
    await store.saveDossier('u1', 'TCS', { summary: 's', business: 'b', strengths: [], vulnerabilities: [], notAvailable: [], generatedAt: '', model: '' }, { seenNewsUrls: [], seenDocUrls: [], resultsKey: null, atRangeHigh: false, atRangeLow: false }, NOW);
    await store.setStatus('u1', 'TCS', 'error', 'later check failed', NOW);
    await store.spawnAnalyst('u2', 'ACC', 'holding', NOW);
    await store.setStatus('u2', 'ACC', 'error', 'x', NOW);
    expect(await store.requeueStalled('u1', NOW)).toBe(2);
    expect(await store.getAnalyst('u1', 'ACC')).toMatchObject({ status: 'initializing', retryCount: 0 });
    expect((await store.getAnalyst('u1', 'PNB'))?.status).toBe('initializing');
    expect((await store.getAnalyst('u1', 'TCS'))?.status).toBe('error');
    expect((await store.getAnalyst('u2', 'ACC'))?.status).toBe('error');
  });
});

describe('journal', () => {
  it('lists the newest entry first and caps the page size', async () => {
    for (let i = 0; i < 3; i++) await store.appendJournal({ userId: 'u1', symbol: 'ACC', ts: new Date(NOW.getTime() + i * 1000).toISOString(), kind: 'price', title: `t${i}`, body: null, impact: null, alert: 'low' });
    const list = await store.listJournal('u1', 'acc');
    expect(list.map((e) => e.title)).toEqual(['t2', 't1', 't0']);
    expect((await store.latestEntries('u1', ['ACC']))['ACC'].title).toBe('t2');
  });
});

describe('daily usage', () => {
  it('counts per India day and starts again the next day', async () => {
    await store.bumpUsage('u1', NOW);
    await store.bumpUsage('u1', NOW);
    expect(await store.getUsage('u1', NOW)).toEqual({ day: '2026-11-11', count: 2 });
    expect(await store.getUsage('u1', new Date('2026-11-12T11:00:00Z'))).toEqual({ day: '2026-11-12', count: 0 });
  });
});

describe('what the cron picks up', () => {
  it('lists initializing analysts, and only active ones whose end-of-day check is due', async () => {
    await store.spawnAnalyst('u1', 'NEW', 'holding', NOW);
    await store.spawnAnalyst('u1', 'DUE', 'holding', NOW);
    await store.spawnAnalyst('u1', 'DONE', 'holding', NOW);
    const watch = { seenNewsUrls: [], seenDocUrls: [], resultsKey: null, atRangeHigh: false, atRangeLow: false };
    const dossier = { summary: 's', business: 'b', strengths: [], vulnerabilities: [], notAvailable: [], generatedAt: '', model: '' };
    await store.saveDossier('u1', 'DUE', dossier, watch, new Date('2026-11-10T11:00:00Z'));
    await store.saveDossier('u1', 'DONE', dossier, watch, new Date('2026-11-11T10:45:00Z'));
    expect((await store.listInitializing(10)).map((a) => a.symbol)).toEqual(['NEW']);
    expect((await store.listDueForHeartbeat(NOW, 10)).map((a) => a.symbol)).toEqual(['DUE']);
  });
});
