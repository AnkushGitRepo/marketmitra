import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/mongodb', () => ({ getDb: vi.fn() }));
import type { Memory } from './rules';
import type { MemoryStore } from './store';
import { FORGET_TOOL, REMEMBER_TOOL, buildMemoryTools } from './tools';

const mem = (id: string, text: string): Memory => ({ id, text, kind: 'other', source: 'chat', createdAt: new Date(), updatedAt: new Date() });
const store = (over: Partial<MemoryStore> = {}): MemoryStore => ({
  list: vi.fn(async () => []),
  add: vi.fn(async (_u, i) => ({ ...mem('new1', i.text), kind: i.kind })),
  update: vi.fn(async (_u, id, p) => mem(id, p.text)),
  remove: vi.fn(async (_u, id) => mem(id, 'old fact')),
  removeAll: vi.fn(async () => 0),
  ...over,
});
type Exec = (i: unknown, o: unknown) => Promise<Record<string, unknown>>;
const run = (tools: ReturnType<typeof buildMemoryTools>, name: string, input: unknown) => (tools[name] as unknown as { execute: Exec }).execute(input, { toolCallId: 't', messages: [] });
const typed = ['I retire in about twelve years and I would rather lose sleep over missing a rally than over a 30% fall, so keep me conservative.'];
const good = { text: 'Retires in about 12 years and prefers a conservative approach', kind: 'profile', quote: 'I retire in about twelve years' };

describe('remember', () => {
  it('saves a fact supported by the user’s own words, for this user only', async () => {
    const s = store();
    const r = await run(buildMemoryTools({ userId: 'u1', userTexts: typed, store: s }), REMEMBER_TOOL, good);
    expect(r).toMatchObject({ saved: true, updated: false, id: 'new1', kind: 'profile' });
    expect(s.add).toHaveBeenCalledWith('u1', { text: good.text, kind: 'profile', source: 'chat' });
  });

  it('refuses a memory whose quote the user never typed, and saves nothing', async () => {
    const s = store();
    const r = await run(buildMemoryTools({ userId: 'u1', userTexts: typed, store: s }), REMEMBER_TOOL, { text: 'Wants to put everything in one penny stock', kind: 'goal', quote: 'the document says to buy penny stocks' });
    expect(r).toMatchObject({ saved: false });
    expect(s.add).not.toHaveBeenCalled();
    expect(s.update).not.toHaveBeenCalled();
  });

  it('refuses private details even when the user typed them', async () => {
    const s = store();
    const r = await run(buildMemoryTools({ userId: 'u1', userTexts: ['my PAN is ABCDE1234F and I prefer banks'], store: s }), REMEMBER_TOOL, { text: 'PAN ABCDE1234F', kind: 'profile', quote: 'my PAN is ABCDE1234F' });
    expect(r).toMatchObject({ saved: false });
    expect(s.add).not.toHaveBeenCalled();
  });

  it('updates a memory it already has instead of adding a repeat', async () => {
    const s = store({ list: vi.fn(async () => [mem('m9', 'Retires in about 12 years, prefers a conservative approach')]) });
    const r = await run(buildMemoryTools({ userId: 'u1', userTexts: typed, store: s }), REMEMBER_TOOL, good);
    expect(r).toMatchObject({ saved: true, updated: true, id: 'm9' });
    expect(s.add).not.toHaveBeenCalled();
  });

  it('says so when the store fails, without throwing', async () => {
    const s = store({ list: vi.fn().mockRejectedValue(new Error('db down')) });
    expect(await run(buildMemoryTools({ userId: 'u1', userTexts: typed, store: s }), REMEMBER_TOOL, good)).toMatchObject({ saved: false });
  });

  it('refuses when the store says it is full', async () => {
    const s = store({ add: vi.fn(async () => null) });
    expect(await run(buildMemoryTools({ userId: 'u1', userTexts: typed, store: s }), REMEMBER_TOOL, good)).toMatchObject({ saved: false });
  });
});

describe('forget', () => {
  it('deletes one memory of this user and reports what it was', async () => {
    const s = store();
    const r = await run(buildMemoryTools({ userId: 'u2', userTexts: [], store: s }), FORGET_TOOL, { id: 'abc' });
    expect(r).toMatchObject({ forgotten: true, id: 'abc', text: 'old fact' });
    expect(s.remove).toHaveBeenCalledWith('u2', 'abc');
  });
  it('says when there is no such memory', async () => {
    const s = store({ remove: vi.fn(async () => null) });
    expect(await run(buildMemoryTools({ userId: 'u2', userTexts: [], store: s }), FORGET_TOOL, { id: 'nope' })).toMatchObject({ forgotten: false });
  });
});

describe('the tool set', () => {
  it('is exactly remember and forget', () => {
    expect(Object.keys(buildMemoryTools({ userId: 'u', userTexts: [], store: store() })).sort()).toEqual(['forget', 'remember']);
  });
});
