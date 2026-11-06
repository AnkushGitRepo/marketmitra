import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export interface Holding {
  id: string;
  userId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

interface HoldingDocument {
  _id: ObjectId;
  userId: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  createdAt: Date;
  updatedAt: Date;
}

function toHolding(doc: HoldingDocument): Holding {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    symbol: doc.symbol,
    quantity: doc.quantity,
    avgPrice: doc.avgPrice,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<HoldingDocument>('holdings');
}

export async function listHoldings(userId: string): Promise<Holding[]> {
  const col = await collection();
  const docs = await col.find({ userId }).sort({ createdAt: 1 }).toArray();
  return docs.map(toHolding);
}

export async function addHolding(
  userId: string,
  input: { symbol: string; quantity: number; avgPrice: number }
): Promise<Holding> {
  const col = await collection();
  const now = new Date();
  const doc: HoldingDocument = {
    _id: new ObjectId(),
    userId,
    symbol: input.symbol.toUpperCase(),
    quantity: input.quantity,
    avgPrice: input.avgPrice,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toHolding(doc);
}

export async function updateHolding(
  userId: string,
  id: string,
  input: { quantity: number; avgPrice: number }
): Promise<Holding | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const result = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { quantity: input.quantity, avgPrice: input.avgPrice, updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return result ? toHolding(result) : null;
}

export async function deleteHolding(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  const result = await col.deleteOne({ _id: new ObjectId(id), userId });
  return result.deletedCount > 0;
}
