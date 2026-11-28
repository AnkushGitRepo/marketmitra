import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { MAX_BULLION_ENTRIES, type BullionEntry, type BullionMetal, type GoldPurity } from './schema';

interface BullionDoc {
  _id: ObjectId;
  userId: string;
  metal: BullionMetal;
  purity: GoldPurity | null;
  grams: number;
  buyPricePerGram: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const toEntry = (d: BullionDoc): BullionEntry => ({ id: d._id.toString(), metal: d.metal, purity: d.purity, grams: d.grams, buyPricePerGram: d.buyPricePerGram, note: d.note });

async function collection() {
  return (await getDb()).collection<BullionDoc>('bullionEntries');
}

export async function listBullion(userId: string): Promise<BullionEntry[]> {
  const col = await collection();
  return (await col.find({ userId }).sort({ createdAt: 1 }).toArray()).map(toEntry);
}

export interface NewBullion {
  readonly metal: BullionMetal;
  readonly purity?: GoldPurity;
  readonly grams: number;
  readonly buyPricePerGram?: number | null;
  readonly note?: string;
}

/** Returns null when the per-user cap is reached. Gold with no purity is stored as 24k. */
export async function createBullion(userId: string, input: NewBullion): Promise<BullionEntry | null> {
  const col = await collection();
  if ((await col.countDocuments({ userId })) >= MAX_BULLION_ENTRIES) return null;
  const now = new Date();
  const doc: BullionDoc = {
    _id: new ObjectId(),
    userId,
    metal: input.metal,
    purity: input.metal === 'gold' ? (input.purity ?? '24k') : null,
    grams: input.grams,
    buyPricePerGram: input.buyPricePerGram ?? null,
    note: input.note?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toEntry(doc);
}

export async function updateBullion(
  userId: string,
  id: string,
  input: { grams?: number; buyPricePerGram?: number | null; purity?: GoldPurity; note?: string }
): Promise<BullionEntry | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const set: Partial<BullionDoc> = { updatedAt: new Date() };
  if (input.grams !== undefined) set.grams = input.grams;
  if (input.buyPricePerGram !== undefined) set.buyPricePerGram = input.buyPricePerGram;
  if (input.note !== undefined) set.note = input.note.trim() || null;
  // Purity can only change on a gold entry.
  const filter = { _id: new ObjectId(id), userId, ...(input.purity !== undefined ? { metal: 'gold' as const } : {}) };
  if (input.purity !== undefined) set.purity = input.purity;
  const doc = await col.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' });
  return doc ? toEntry(doc) : null;
}

export async function deleteBullion(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  return (await col.deleteOne({ _id: new ObjectId(id), userId })).deletedCount > 0;
}
