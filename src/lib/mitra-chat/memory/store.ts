// Mitra's memories, one document each in the user's own account (#402, ADR 0083). Every read and write is by `userId`.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { MAX_MEMORIES, MAX_MEMORY_CHARS, type Memory, type MemoryKind } from './rules';

interface MemoryDoc {
  _id: ObjectId;
  userId: string;
  text: string;
  kind: MemoryKind;
  source: 'chat' | 'manual';
  createdAt: Date;
  updatedAt: Date;
}

const toMemory = (d: MemoryDoc): Memory => ({ id: d._id.toString(), text: d.text, kind: d.kind, source: d.source, createdAt: d.createdAt, updatedAt: d.updatedAt });

async function collection() {
  return (await getDb()).collection<MemoryDoc>('mitraMemories');
}

/** What the tools and the routes need from the store, so they test without a database. */
export interface MemoryStore {
  readonly list: (userId: string) => Promise<Memory[]>;
  readonly add: (userId: string, input: { text: string; kind: MemoryKind; source: 'chat' | 'manual' }) => Promise<Memory | null>;
  readonly update: (userId: string, id: string, patch: { text: string; kind?: MemoryKind }) => Promise<Memory | null>;
  readonly remove: (userId: string, id: string) => Promise<Memory | null>;
  readonly removeAll: (userId: string) => Promise<number>;
}

export const liveMemoryStore: MemoryStore = {
  async list(userId) {
    const docs = await (await collection()).find({ userId }).sort({ updatedAt: -1 }).limit(MAX_MEMORIES).toArray();
    return docs.map(toMemory);
  },
  async add(userId, input) {
    const col = await collection();
    if ((await col.countDocuments({ userId })) >= MAX_MEMORIES) return null;
    const now = new Date();
    const doc: MemoryDoc = { _id: new ObjectId(), userId, text: input.text.slice(0, MAX_MEMORY_CHARS), kind: input.kind, source: input.source, createdAt: now, updatedAt: now };
    await col.insertOne(doc);
    return toMemory(doc);
  },
  async update(userId, id, patch) {
    if (!ObjectId.isValid(id)) return null;
    const set = { text: patch.text.slice(0, MAX_MEMORY_CHARS), ...(patch.kind ? { kind: patch.kind } : {}), updatedAt: new Date() };
    const doc = await (await collection()).findOneAndUpdate({ _id: new ObjectId(id), userId }, { $set: set }, { returnDocument: 'after' });
    return doc ? toMemory(doc) : null;
  },
  async remove(userId, id) {
    if (!ObjectId.isValid(id)) return null;
    const doc = await (await collection()).findOneAndDelete({ _id: new ObjectId(id), userId });
    return doc ? toMemory(doc) : null;
  },
  async removeAll(userId) {
    return (await (await collection()).deleteMany({ userId })).deletedCount;
  },
};
