import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { JournalAction, JournalEntry, KillFiring } from './types';

type Doc = Omit<JournalEntry, 'id' | 'createdAt' | 'actionAt'> & {
  _id: ObjectId;
  userId: string;
  createdAt: Date;
  actionAt: Date | null;
};

async function col() {
  return (await getDb()).collection<Doc>('advisor_journal');
}

function toEntry(d: Doc): JournalEntry {
  const { _id, userId: _u, createdAt, actionAt, ...rest } = d;
  void _u;
  return { ...rest, id: _id.toString(), createdAt: createdAt.toISOString(), actionAt: actionAt?.toISOString() ?? null };
}

export type NewEntry = Omit<JournalEntry, 'id' | 'createdAt' | 'action' | 'actionNote' | 'actionAt' | 'actedAmountINR' | 'killFired'>;

export async function createEntry(userId: string, e: NewEntry): Promise<JournalEntry> {
  const doc: Doc = {
    ...e,
    _id: new ObjectId(),
    userId,
    createdAt: new Date(),
    action: 'pending',
    actionNote: null,
    actionAt: null,
    actedAmountINR: null,
    killFired: [],
  };
  await (await col()).insertOne(doc);
  return toEntry(doc);
}

export async function listEntries(userId: string, limit = 200): Promise<JournalEntry[]> {
  const docs = await (await col()).find({ userId }).sort({ createdAt: -1 }).limit(limit).toArray();
  return docs.map(toEntry);
}

export async function recordAction(
  userId: string,
  id: string,
  update: { action: JournalAction; note: string | null; actedAmountINR: number | null },
): Promise<JournalEntry | null> {
  if (!ObjectId.isValid(id)) return null;
  const res = await (await col()).findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { action: update.action, actionNote: update.note, actedAmountINR: update.actedAmountINR, actionAt: new Date() } },
    { returnDocument: 'after' },
  );
  return res ? toEntry(res) : null;
}

/** Open stock recommendations still worth monitoring (not ignored), across users. */
export async function listMonitoredEntries(userId?: string): Promise<Array<JournalEntry & { userId: string }>> {
  const docs = await (await col())
    .find({ kind: 'stock', action: { $ne: 'ignored' }, ...(userId ? { userId } : {}) })
    .toArray();
  return docs.map((d) => ({ ...toEntry(d), userId: d.userId }));
}

export async function appendFiring(id: string, firing: KillFiring): Promise<void> {
  await (await col()).updateOne({ _id: new ObjectId(id) }, { $push: { killFired: firing } });
}
