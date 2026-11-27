import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { MAX_CASH_ENTRIES, type CashEntry } from './schema';

interface CashDoc {
  _id: ObjectId;
  userId: string;
  label: string;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

const toEntry = (doc: CashDoc): CashEntry => ({ id: doc._id.toString(), label: doc.label, amount: doc.amount });

async function collection() {
  return (await getDb()).collection<CashDoc>('cashEntries');
}

export async function listCash(userId: string): Promise<CashEntry[]> {
  const col = await collection();
  return (await col.find({ userId }).sort({ createdAt: 1 }).toArray()).map(toEntry);
}

/** Returns null when the per-user cap is reached. */
export async function createCash(userId: string, input: { label: string; amount: number }): Promise<CashEntry | null> {
  const col = await collection();
  if ((await col.countDocuments({ userId })) >= MAX_CASH_ENTRIES) return null;
  const now = new Date();
  const doc: CashDoc = { _id: new ObjectId(), userId, label: input.label, amount: input.amount, createdAt: now, updatedAt: now };
  await col.insertOne(doc);
  return toEntry(doc);
}

export async function updateCash(userId: string, id: string, input: { label?: string; amount?: number }): Promise<CashEntry | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOneAndUpdate({ _id: new ObjectId(id), userId }, { $set: { ...input, updatedAt: new Date() } }, { returnDocument: 'after' });
  return doc ? toEntry(doc) : null;
}

export async function deleteCash(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  return (await col.deleteOne({ _id: new ObjectId(id), userId })).deletedCount > 0;
}
