import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Doc {
  _id: { toString: () => string; equals?: (o: unknown) => boolean };
  userId: string;
  name: string;
  scope: 'read' | 'write';
  prefix: string;
  hash: string;
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

let store: Doc[] = [];
const events: Array<Record<string, unknown>> = [];

const idOf = (v: unknown) => String(v);
const matches = (d: Doc, f: Record<string, unknown>) =>
  Object.entries(f).every(([k, v]) => {
    if (k === '_id') return idOf(d._id) === idOf(v);
    const actual = (d as unknown as Record<string, unknown>)[k];
    return v === null ? actual === null : actual === v;
  });

const fakeCol = {
  createIndexes: vi.fn(async () => undefined),
  insertOne: vi.fn(async (doc: Doc) => {
    store.push(doc);
    return { insertedId: doc._id };
  }),
  find: vi.fn((f: Record<string, unknown>) => ({
    sort: () => ({ toArray: async () => store.filter((d) => matches(d, f)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()) }),
    toArray: async () => store.filter((d) => matches(d, f)),
  })),
  deleteOne: vi.fn(async (f: Record<string, unknown>) => {
    const i = store.findIndex((d) => matches(d, f));
    if (i >= 0) store.splice(i, 1);
    return { deletedCount: i >= 0 ? 1 : 0 };
  }),
  findOne: vi.fn(async (f: Record<string, unknown>) => store.find((d) => matches(d, f)) ?? null),
  updateOne: vi.fn(async (f: Record<string, unknown>, u: { $set: Partial<Doc> }) => {
    const d = store.find((x) => matches(x, f));
    if (d) Object.assign(d, u.$set);
    return { modifiedCount: d ? 1 : 0 };
  }),
};

vi.mock('@/lib/mongodb', () => ({ getDb: async () => ({ collection: () => fakeCol }) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: vi.fn(async (e: Record<string, unknown>) => void events.push(e)) }));

const { createToken, listTokens, revokeToken, resolveToken, TokenLimitError } = await import('./store');
const { hashToken, MAX_ACTIVE_TOKENS } = await import('./pat');

const NOW = new Date('2026-11-11T00:00:00.000Z');
const input = (name = 'cron') => ({ name, scope: 'read' as const, expiry: '90d' as const });

beforeEach(() => {
  store = [];
  events.length = 0;
  vi.clearAllMocks();
});

describe('createToken', () => {
  it('returns the plaintext once and stores only its hash', async () => {
    const { token, view } = await createToken('u1', input(), NOW);
    expect(token.startsWith('mm_pat_r_')).toBe(true);
    expect(store).toHaveLength(1);
    expect(store[0].hash).toBe(hashToken(token));
    expect(JSON.stringify(store[0])).not.toContain(token);
    expect(view).toMatchObject({ name: 'cron', scope: 'read', status: 'active' });
    expect(view.prefix).toBe(token.slice(0, 13));
    expect(Object.keys(view)).not.toContain('hash');
  });

  it('applies the chosen expiry', async () => {
    const { view } = await createToken('u1', { ...input(), expiry: '30d' }, NOW);
    expect(view.expiresAt?.toISOString()).toBe('2026-12-11T00:00:00.000Z');
  });

  it('enforces the active-token cap, ignoring revoked and expired ones', async () => {
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i++) await createToken('u1', input(`t${i}`), NOW);
    await expect(createToken('u1', input('extra'), NOW)).rejects.toBeInstanceOf(TokenLimitError);
    // another user is unaffected
    await expect(createToken('u2', input(), NOW)).resolves.toBeDefined();
    // revoking frees a slot
    await revokeToken('u1', String(store[0]._id), NOW);
    await expect(createToken('u1', input('again'), NOW)).resolves.toBeDefined();
  });

  it('backs out when a parallel create slipped past the first check', async () => {
    // Simulate a racing request: another token appears between the pre-check and the post-insert recount.
    for (let i = 0; i < MAX_ACTIVE_TOKENS - 1; i++) await createToken('u1', input(`t${i}`), NOW);
    const realFind = fakeCol.find.getMockImplementation()!;
    let calls = 0;
    fakeCol.find.mockImplementation((f: Record<string, unknown>) => {
      if (++calls === 2) {
        store.push({ ...store[0], _id: { toString: () => 'racer' }, hash: 'racer-hash' });
      }
      return realFind(f);
    });
    await expect(createToken('u1', input('loser'), NOW)).rejects.toBeInstanceOf(TokenLimitError);
    expect(store.some((d) => d.name === 'loser')).toBe(false);
    fakeCol.find.mockImplementation(realFind);
  });

  it('logs creation without the secret', async () => {
    const { token } = await createToken('u1', input(), NOW);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain(token);
  });
});

describe('listTokens', () => {
  it('lists only the caller\'s tokens, newest first, with derived status', async () => {
    await createToken('u1', input('old'), new Date('2026-10-01T00:00:00Z'));
    await createToken('u1', { ...input('short'), expiry: '30d' }, new Date('2026-09-01T00:00:00Z'));
    await createToken('u2', input('other'), NOW);
    const list = await listTokens('u1', NOW);
    expect(list.map((t) => t.name)).toEqual(['old', 'short']);
    expect(list.find((t) => t.name === 'short')?.status).toBe('expired');
  });
});

describe('revokeToken', () => {
  it('revokes the caller\'s own token only', async () => {
    const { view } = await createToken('u1', input(), NOW);
    expect(await revokeToken('u2', view.id, NOW)).toBe(false);
    expect(await revokeToken('u1', view.id, NOW)).toBe(true);
    expect(await revokeToken('u1', view.id, NOW)).toBe(false);
    expect((await listTokens('u1', NOW))[0].status).toBe('revoked');
  });
  it('treats a malformed id as not found', async () => {
    expect(await revokeToken('u1', 'not-an-id', NOW)).toBe(false);
  });
});

describe('resolveToken', () => {
  it('resolves a live token to its owner and scope', async () => {
    const { token } = await createToken('u1', { ...input(), scope: 'write' }, NOW);
    expect(await resolveToken(token, NOW)).toMatchObject({ userId: 'u1', scope: 'write' });
  });
  it('rejects unknown, revoked and expired tokens', async () => {
    const { token, view } = await createToken('u1', { ...input(), expiry: '30d' }, NOW);
    expect(await resolveToken('mm_pat_r_' + 'A'.repeat(43), NOW)).toBeNull();
    expect(await resolveToken(token, new Date('2027-01-01T00:00:00Z'))).toBeNull();
    await revokeToken('u1', view.id, NOW);
    expect(await resolveToken(token, NOW)).toBeNull();
  });
  it('records last use, but not on every request', async () => {
    const { token } = await createToken('u1', input(), NOW);
    await resolveToken(token, new Date(NOW.getTime() + 1000));
    expect(store[0].lastUsedAt?.toISOString()).toBe('2026-11-11T00:00:01.000Z');
    await resolveToken(token, new Date(NOW.getTime() + 2000));
    expect(store[0].lastUsedAt?.toISOString()).toBe('2026-11-11T00:00:01.000Z');
    await resolveToken(token, new Date(NOW.getTime() + 10 * 60_000));
    expect(store[0].lastUsedAt?.getTime()).toBe(NOW.getTime() + 10 * 60_000);
  });
});
