import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessage } from 'ai';

// A tiny in-memory Mongo: equality + $in + $lte + $regex filters, $set/$inc updates.
type Row = Record<string, unknown> & { _id?: { toString(): string } };
function matches(row: Row, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([k, v]) => {
    const actual = row[k];
    if (v && typeof v === 'object' && !(v instanceof Date) && !('toHexString' in v)) {
      const op = v as Record<string, unknown>;
      if ('$regex' in op) return new RegExp(op.$regex as string, op.$options as string).test(String(actual));
      if ('$lte' in op) return (actual as number) <= (op.$lte as number);
      if ('$in' in op) return (op.$in as unknown[]).includes(actual);
    }
    return String(actual) === String(v);
  });
}
function fakeCollection(rows: Row[]) {
  const apply = (row: Row, update: Record<string, Record<string, unknown>>) => {
    Object.assign(row, update.$set ?? {});
    for (const [k, n] of Object.entries(update.$inc ?? {})) row[k] = (row[k] as number) + (n as number);
  };
  return {
    rows,
    createIndex: async () => 'ok',
    countDocuments: async (f: Record<string, unknown>) => rows.filter((r) => matches(r, f)).length,
    insertOne: async (d: Row) => void rows.push(d),
    insertMany: async (ds: Row[]) => void rows.push(...ds),
    find: (f: Record<string, unknown>) => {
      let out = rows.filter((r) => matches(r, f));
      const cur = {
        sort: (s: Record<string, 1 | -1>) => {
          const [[key, dir]] = Object.entries(s);
          out = [...out].sort((a, b) => ((a[key] as number | Date) > (b[key] as number | Date) ? 1 : -1) * dir);
          return cur;
        },
        limit: (n: number) => ((out = out.slice(0, n)), cur),
        toArray: async () => out,
      };
      return cur;
    },
    findOne: async (f: Record<string, unknown>) => rows.find((r) => matches(r, f)) ?? null,
    findOneAndUpdate: async (f: Record<string, unknown>, u: Record<string, Record<string, unknown>>, o?: { returnDocument?: string }) => {
      const row = rows.find((r) => matches(r, f));
      if (!row) return null;
      const before = { ...row };
      apply(row, u);
      return o?.returnDocument === 'before' ? before : row;
    },
    updateOne: async (f: Record<string, unknown>, u: Record<string, Record<string, unknown>>) => {
      const row = rows.find((r) => matches(r, f));
      if (row) apply(row, u);
    },
    deleteOne: async (f: Record<string, unknown>) => {
      const i = rows.findIndex((r) => matches(r, f));
      if (i >= 0) rows.splice(i, 1);
      return { deletedCount: i >= 0 ? 1 : 0 };
    },
    deleteMany: async (f: Record<string, unknown>) => {
      const keep = rows.filter((r) => !matches(r, f));
      const n = rows.length - keep.length;
      rows.splice(0, rows.length, ...keep);
      return { deletedCount: n };
    },
  };
}

const stores = {
  mitraConversations: fakeCollection([]),
  mitraMessages: fakeCollection([]),
  chatMessages: fakeCollection([]),
};
vi.mock('@/lib/mongodb', () => ({
  getDb: async () => ({ collection: (name: string) => stores[name as keyof typeof stores] ?? fakeCollection([]) }),
}));

const repo = await import('./conversations');
const { MAX_CONVERSATIONS_PER_USER, DEFAULT_TITLE } = await import('./limits');

const userMsg = (text: string): UIMessage => ({ id: text, role: 'user', parts: [{ type: 'text', text }] });
const botMsg = (text: string): UIMessage => ({ id: `a-${text}`, role: 'assistant', parts: [{ type: 'text', text }] });

beforeEach(() => {
  for (const s of Object.values(stores)) s.rows.length = 0;
});

describe('conversations', () => {
  it('creates with a default auto title, or a user title when given', async () => {
    const a = await repo.createConversation('u1');
    expect(a).toMatchObject({ title: DEFAULT_TITLE, titleSource: 'auto', messageCount: 0 });
    const b = await repo.createConversation('u1', '  Q3   plan ');
    expect(b).toMatchObject({ title: 'Q3 plan', titleSource: 'user' });
  });

  it('enforces the per-user conversation cap', async () => {
    for (let i = 0; i < MAX_CONVERSATIONS_PER_USER; i++) await repo.createConversation('u1');
    expect(await repo.createConversation('u1')).toBeNull();
    expect(await repo.createConversation('u2')).not.toBeNull();
  });

  it('lists newest first, scoped to the user, and searches titles literally', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    await repo.createConversation('u1', 'Tata Motors results');
    vi.setSystemTime(2_000);
    await repo.createConversation('u1', 'HDFC (Q2)');
    await repo.createConversation('u2', 'Tata other user');
    vi.useRealTimers();
    expect((await repo.listConversations('u1')).map((c) => c.title)).toEqual(['HDFC (Q2)', 'Tata Motors results']);
    expect((await repo.listConversations('u1', 'tata')).map((c) => c.title)).toEqual(['Tata Motors results']);
    expect(await repo.listConversations('u1', '(Q2')).toHaveLength(1); // regex chars are escaped
    expect(await repo.listConversations('u1', '.*')).toHaveLength(0);
  });

  it("never returns another user's conversation", async () => {
    const c = (await repo.createConversation('u1'))!;
    expect(await repo.getConversation('u2', c.id)).toBeNull();
    expect(await repo.renameConversation('u2', c.id, 'x')).toBeNull();
    expect(await repo.deleteConversation('u2', c.id)).toBe(false);
    expect(await repo.getConversation('u1', 'not-an-id')).toBeNull();
  });

  it('renames (user-owned title) and rejects blank titles', async () => {
    const c = (await repo.createConversation('u1'))!;
    expect(await repo.renameConversation('u1', c.id, '   ')).toBeNull();
    expect(await repo.renameConversation('u1', c.id, ' Gold ETF ')).toMatchObject({ title: 'Gold ETF', titleSource: 'user' });
  });
});

describe('messages', () => {
  it('appends in order with increasing seq and loads them back', async () => {
    const c = (await repo.createConversation('u1'))!;
    await repo.appendMessages('u1', c.id, [userMsg('hi'), botMsg('hello')]);
    await repo.appendMessages('u1', c.id, [userMsg('again'), botMsg('yes')]);
    const loaded = await repo.loadMessages('u1', c.id);
    expect(loaded.map((m) => m.id)).toEqual(['hi', 'a-hello', 'again', 'a-yes']);
    expect((await repo.getConversation('u1', c.id))?.messageCount).toBe(4);
  });

  it('auto-titles from the first user message, but not a user-chosen title', async () => {
    const auto = (await repo.createConversation('u1'))!;
    await repo.appendMessages('u1', auto.id, [userMsg('Is Nifty overvalued right now?')]);
    expect((await repo.getConversation('u1', auto.id))?.title).toBe('Is Nifty overvalued right now?');

    const named = (await repo.createConversation('u1', 'Mine'))!;
    await repo.appendMessages('u1', named.id, [userMsg('something else')]);
    expect((await repo.getConversation('u1', named.id))?.title).toBe('Mine');
  });

  it("won't append to someone else's conversation, and delete cascades messages", async () => {
    const c = (await repo.createConversation('u1'))!;
    expect(await repo.appendMessages('u2', c.id, [userMsg('x')])).toBe(false);
    await repo.appendMessages('u1', c.id, [userMsg('hi')]);
    expect(await repo.deleteConversation('u1', c.id)).toBe(true);
    expect(stores.mitraMessages.rows).toHaveLength(0);
  });

  it('stores a capped summary', async () => {
    const c = (await repo.createConversation('u1'))!;
    await repo.saveSummary('u1', c.id, 'z'.repeat(9000), 12);
    const got = await repo.getConversation('u1', c.id);
    expect(got?.summary.length).toBeLessThanOrEqual(3000);
    expect(got?.summarizedThrough).toBe(12);
  });
});

describe('migrateLegacyThread', () => {
  const legacy = (role: 'user' | 'assistant', content: string, t: number) => ({
    userId: 'u1',
    role,
    content,
    createdAt: new Date(t),
  });

  it('moves the old single thread into a first conversation, once', async () => {
    stores.chatMessages.rows.push(legacy('user', 'old q', 1), legacy('assistant', 'old a', 2));
    const first = await repo.migrateLegacyThread('u1');
    expect(first?.title).toBe('Earlier chat');
    expect((await repo.loadMessages('u1', first!.id)).map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(await repo.migrateLegacyThread('u1')).toBeNull(); // already has a conversation
  });

  it('does nothing without legacy history', async () => {
    expect(await repo.migrateLegacyThread('u1')).toBeNull();
    expect(stores.mitraConversations.rows).toHaveLength(0);
  });
});
