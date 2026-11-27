// Conviction entries (#411): one per (user, symbol). Setting a target keeps a single price alert in step with it;
// clearing the target or deleting the entry removes that alert.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { createAlert, deleteAlert, updateAlert } from '@/lib/alerts/store';
import type { ConvictionEntry } from './board';
import { MAX_ENTRIES_PER_USER, type ConvictionInput, type ConvictionTag, type TargetDirection } from './schema';
import { targetAlertNote, targetAlertParams } from './targetAlert';

interface EntryDoc {
  _id: ObjectId;
  userId: string;
  symbol: string;
  tag: ConvictionTag;
  waitFor: string | null;
  targetPrice: number | null;
  targetDirection: TargetDirection;
  noteId: string | null;
  alertId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function toEntry(doc: EntryDoc): ConvictionEntry {
  return {
    id: doc._id.toString(),
    symbol: doc.symbol,
    tag: doc.tag,
    waitFor: doc.waitFor,
    targetPrice: doc.targetPrice,
    targetDirection: doc.targetDirection,
    noteId: doc.noteId,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<EntryDoc>('convictionEntries');
}

export async function listEntries(userId: string): Promise<ConvictionEntry[]> {
  const col = await collection();
  return (await col.find({ userId }).sort({ createdAt: 1 }).toArray()).map(toEntry);
}

/** Keeps the alert in step with the target. Returns the alert id to store, or null when there is no target. */
async function syncAlert(
  userId: string,
  symbol: string,
  alertId: string | null,
  targetPrice: number | null,
  direction: TargetDirection
): Promise<string | null> {
  if (targetPrice === null) {
    if (alertId) await deleteAlert(userId, alertId);
    return null;
  }
  const params = targetAlertParams(targetPrice, direction);
  const note = targetAlertNote(symbol, direction);
  if (alertId) {
    // Editing the params re-arms the alert, so moving a target that already fired lets it fire again.
    const updated = await updateAlert(userId, alertId, { params, note });
    if (updated) return updated.id;
  }
  const created = await createAlert(userId, { type: 'price_threshold', symbol, params, note, source: 'user' });
  return created.id;
}

/** Creates the entry, or updates the fields that were sent. Returns null when the per-user cap is hit. */
export async function upsertEntry(userId: string, input: ConvictionInput): Promise<ConvictionEntry | null> {
  const col = await collection();
  const existing = await col.findOne({ userId, symbol: input.symbol });
  if (!existing && (await col.countDocuments({ userId })) >= MAX_ENTRIES_PER_USER) return null;

  const tag = input.tag ?? existing?.tag ?? 'tracking';
  const next = {
    tag,
    waitFor: tag === 'wait' ? (input.waitFor !== undefined ? input.waitFor || null : (existing?.waitFor ?? null)) : null,
    targetPrice: input.targetPrice !== undefined ? input.targetPrice : (existing?.targetPrice ?? null),
    targetDirection: input.targetDirection ?? existing?.targetDirection ?? 'at_or_below',
    noteId: input.noteId !== undefined ? input.noteId : (existing?.noteId ?? null),
  };
  const alertId = await syncAlert(userId, input.symbol, existing?.alertId ?? null, next.targetPrice, next.targetDirection);

  const now = new Date();
  const doc = await col.findOneAndUpdate(
    { userId, symbol: input.symbol },
    { $set: { ...next, alertId, updatedAt: now }, $setOnInsert: { _id: new ObjectId(), createdAt: now } },
    { upsert: true, returnDocument: 'after' }
  );
  return doc ? toEntry(doc) : null;
}

export async function deleteEntry(userId: string, symbol: string): Promise<boolean> {
  const col = await collection();
  const doc = await col.findOneAndDelete({ userId, symbol: symbol.trim().toUpperCase() });
  if (!doc) return false;
  if (doc.alertId) await deleteAlert(userId, doc.alertId);
  return true;
}
