import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { recordHoldingEvent } from '@/lib/tradeJournal/record';

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
  input: { symbol: string; quantity: number; avgPrice: number },
  options: {
    reason?: string | null;
    /** Runs (and is awaited) before the journal snapshot, so the snapshot sees what it creates, e.g. the default guardrail alerts. Must not throw. */
    beforeSnapshot?: (symbol: string) => Promise<unknown>;
  } = {}
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
  const holding = toHolding(doc);
  // Trade journal (#412): fire-and-forget, the holding is already saved.
  void (options.beforeSnapshot?.(holding.symbol) ?? Promise.resolve()).then(() =>
    recordHoldingEvent(userId, holding.symbol, null, { quantity: holding.quantity, avgPrice: holding.avgPrice }, options.reason)
  );
  return holding;
}

export async function updateHolding(
  userId: string,
  id: string,
  input: { quantity: number; avgPrice: number },
  options: { reason?: string | null } = {}
): Promise<Holding | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const previous = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { quantity: input.quantity, avgPrice: input.avgPrice, updatedAt: new Date() } },
    { returnDocument: 'before' }
  );
  if (!previous) return null;
  const holding = toHolding({ ...previous, quantity: input.quantity, avgPrice: input.avgPrice, updatedAt: new Date() });
  void recordHoldingEvent(
    userId,
    holding.symbol,
    { quantity: previous.quantity, avgPrice: previous.avgPrice },
    { quantity: holding.quantity, avgPrice: holding.avgPrice },
    options.reason
  );
  return holding;
}

export async function deleteHolding(
  userId: string,
  id: string,
  options: { reason?: string | null } = {}
): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  const removed = await col.findOneAndDelete({ _id: new ObjectId(id), userId });
  if (!removed) return false;
  void recordHoldingEvent(userId, removed.symbol, { quantity: removed.quantity, avgPrice: removed.avgPrice }, null, options.reason);
  return true;
}
