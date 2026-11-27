// Journal storage (#412). Snapshots are only ever inserted; the single later edit is the post-mortem text.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { MAX_POST_MORTEM, cleanText } from './snapshot';
import type { HoldingState, JournalEvent, JournalSnapshot, ThesisSnapshot } from './types';

interface JournalDoc {
  _id: ObjectId;
  userId: string;
  symbol: string;
  event: JournalEvent;
  at: Date;
  before: HoldingState | null;
  after: HoldingState | null;
  marketPrice: number | null;
  pe: number | null;
  roce: number | null;
  thesis: ThesisSnapshot | null;
  reason: string | null;
  guardrails: string[];
  postMortem: string | null;
}

export type NewSnapshot = Omit<JournalSnapshot, 'id' | 'at' | 'postMortem'>;

function toSnapshot(doc: JournalDoc): JournalSnapshot {
  return {
    id: doc._id.toString(),
    symbol: doc.symbol,
    event: doc.event,
    at: doc.at.toISOString(),
    before: doc.before,
    after: doc.after,
    marketPrice: doc.marketPrice,
    pe: doc.pe,
    roce: doc.roce,
    thesis: doc.thesis,
    reason: doc.reason,
    guardrails: doc.guardrails,
    postMortem: doc.postMortem,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<JournalDoc>('tradeJournal');
}

export async function insertSnapshot(userId: string, snapshot: NewSnapshot, now: Date): Promise<JournalSnapshot> {
  const col = await collection();
  const doc: JournalDoc = { _id: new ObjectId(), userId, ...snapshot, guardrails: [...snapshot.guardrails], at: now, postMortem: null };
  await col.insertOne(doc);
  return toSnapshot(doc);
}

/** Newest first, optionally for one symbol. */
export async function listSnapshots(userId: string, symbol?: string): Promise<JournalSnapshot[]> {
  const col = await collection();
  const filter = symbol ? { userId, symbol: symbol.trim().toUpperCase() } : { userId };
  return (await col.find(filter).sort({ at: -1 }).limit(500).toArray()).map(toSnapshot);
}

/** Sets or clears the post-mortem. Returns null when the entry is not the user's. */
export async function setPostMortem(userId: string, id: string, text: string | null): Promise<JournalSnapshot | null> {
  if (!ObjectId.isValid(id)) return null;
  const col = await collection();
  const doc = await col.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { postMortem: cleanText(text, MAX_POST_MORTEM) } },
    { returnDocument: 'after' }
  );
  return doc ? toSnapshot(doc) : null;
}
