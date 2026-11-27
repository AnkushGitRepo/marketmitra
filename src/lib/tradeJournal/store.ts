// Journal storage (#412). Snapshots are only ever inserted; the single later edit is the post-mortem text.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { MAX_POST_MORTEM, MAX_REASON, cleanText } from './snapshot';
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

export interface EditableText {
  readonly reason?: string | null;
  readonly postMortem?: string | null;
}

/**
 * Edits the user's own words on an entry: the reason and the reflection. What the app recorded (price, multiples,
 * thesis copy, guardrails) stays as it was, so an entry cannot be made to say something the data did not. Only the
 * fields sent change. Returns null when the entry is not the user's.
 */
export async function editEntryText(userId: string, id: string, edit: EditableText): Promise<JournalSnapshot | null> {
  if (!ObjectId.isValid(id)) return null;
  const set: Partial<Pick<JournalDoc, 'reason' | 'postMortem'>> = {};
  if (edit.reason !== undefined) set.reason = cleanText(edit.reason, MAX_REASON);
  if (edit.postMortem !== undefined) set.postMortem = cleanText(edit.postMortem, MAX_POST_MORTEM);
  const col = await collection();
  const filter = { _id: new ObjectId(id), userId };
  if (Object.keys(set).length === 0) {
    const doc = await col.findOne(filter);
    return doc ? toSnapshot(doc) : null;
  }
  const doc = await col.findOneAndUpdate(filter, { $set: set }, { returnDocument: 'after' });
  return doc ? toSnapshot(doc) : null;
}

export async function deleteSnapshot(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const col = await collection();
  return (await col.deleteOne({ _id: new ObjectId(id), userId })).deletedCount > 0;
}

/** Removes the user's whole journal; returns how many entries went. */
export async function deleteAllSnapshots(userId: string): Promise<number> {
  const col = await collection();
  return (await col.deleteMany({ userId })).deletedCount;
}
