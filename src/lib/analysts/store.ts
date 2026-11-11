// MongoDB store for the stock analysts (#128, ADR 0058): `stockAnalysts` (one per user and symbol), `analystJournal` and `analystUsage`.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { istDay, isHeartbeatDue, type Usage } from './caps';
import type { AnalystRecord } from './engine';
import { EMPTY_WATCH, type AnalystSource, type AnalystStatus, type Dossier, type JournalEntry, type WatchState } from './types';

interface AnalystDoc {
  _id: ObjectId;
  userId: string;
  symbol: string;
  source: AnalystSource;
  status: AnalystStatus;
  statusNote: string | null;
  dossier: Dossier | null;
  watch: WatchState;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface JournalDoc extends Omit<JournalEntry, 'id' | 'ts'> {
  _id: ObjectId;
  userId: string;
  ts: Date;
}

interface UsageDoc {
  _id: ObjectId;
  userId: string;
  day: string;
  count: number;
}

export const MAX_ANALYSTS_PER_USER = 40;
const MAX_JOURNAL_RETURNED = 100;

const analysts = async () => (await getDb()).collection<AnalystDoc>('stockAnalysts');
const journal = async () => (await getDb()).collection<JournalDoc>('analystJournal');
const usageCol = async () => (await getDb()).collection<UsageDoc>('analystUsage');

export async function ensureAnalystIndexes(): Promise<void> {
  await (await analysts()).createIndexes([
    { key: { userId: 1, symbol: 1 }, name: 'user_symbol_unique', unique: true },
    { key: { status: 1, lastCheckedAt: 1 }, name: 'status_checked' },
  ]);
  await (await journal()).createIndexes([{ key: { userId: 1, symbol: 1, ts: -1 }, name: 'user_symbol_ts' }]);
  await (await usageCol()).createIndexes([{ key: { userId: 1, day: 1 }, name: 'user_day_unique', unique: true }]);
}

const toRecord = (d: AnalystDoc): AnalystRecord => ({
  userId: d.userId,
  symbol: d.symbol,
  source: d.source,
  status: d.status,
  statusNote: d.statusNote,
  dossier: d.dossier,
  watch: d.watch,
  lastCheckedAt: d.lastCheckedAt,
});

const toEntry = (d: JournalDoc): JournalEntry => ({
  id: d._id.toString(),
  symbol: d.symbol,
  ts: d.ts.toISOString(),
  kind: d.kind,
  title: d.title,
  body: d.body,
  impact: d.impact,
  alert: d.alert,
});

/** Creates the analyst if there is none (a second call is a no-op). Null when the user is at the analyst limit. */
export async function spawnAnalyst(userId: string, symbolRaw: string, source: AnalystSource, now: Date = new Date()): Promise<AnalystRecord | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  const col = await analysts();
  const existing = await col.findOne({ userId, symbol });
  if (existing) return toRecord(existing);
  if ((await col.countDocuments({ userId })) >= MAX_ANALYSTS_PER_USER) return null;
  const doc: AnalystDoc = {
    _id: new ObjectId(),
    userId,
    symbol,
    source,
    status: 'initializing',
    statusNote: null,
    dossier: null,
    watch: EMPTY_WATCH,
    lastCheckedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  return toRecord(doc);
}

export async function getAnalyst(userId: string, symbol: string): Promise<AnalystRecord | null> {
  const d = await (await analysts()).findOne({ userId, symbol: symbol.toUpperCase() });
  return d ? toRecord(d) : null;
}

export async function listAnalysts(userId: string): Promise<AnalystRecord[]> {
  const docs = await (await analysts()).find({ userId }).sort({ createdAt: 1 }).toArray();
  return docs.map(toRecord);
}

export async function setStatus(userId: string, symbol: string, status: AnalystStatus, note: string | null = null, now: Date = new Date()): Promise<boolean> {
  const res = await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { status, statusNote: note, updatedAt: now } });
  return res.modifiedCount > 0;
}

export async function saveDossier(userId: string, symbol: string, dossier: Dossier, watch: WatchState, now: Date = new Date()): Promise<void> {
  await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { dossier, watch, status: 'active', statusNote: null, lastCheckedAt: now, updatedAt: now } });
}

export async function saveCheck(userId: string, symbol: string, watch: WatchState, lastCheckedAt: Date): Promise<void> {
  await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { watch, lastCheckedAt, updatedAt: lastCheckedAt } });
}

export async function appendJournal(entry: Omit<JournalEntry, 'id'> & { userId: string }): Promise<void> {
  const { ts, ...rest } = entry;
  await (await journal()).insertOne({ _id: new ObjectId(), ...rest, symbol: entry.symbol.toUpperCase(), ts: new Date(ts) });
}

export async function listJournal(userId: string, symbol: string, limit = MAX_JOURNAL_RETURNED): Promise<JournalEntry[]> {
  const docs = await (await journal()).find({ userId, symbol: symbol.toUpperCase() }).sort({ ts: -1 }).limit(Math.min(limit, MAX_JOURNAL_RETURNED)).toArray();
  return docs.map(toEntry);
}

/** The newest journal entry for each of the user's analysts, for the roster. */
export async function latestEntries(userId: string, symbols: readonly string[]): Promise<Record<string, JournalEntry>> {
  const out: Record<string, JournalEntry> = {};
  for (const s of symbols) {
    const [first] = await listJournal(userId, s, 1);
    if (first) out[s] = first;
  }
  return out;
}

export async function getUsage(userId: string, now: Date = new Date()): Promise<Usage> {
  const day = istDay(now);
  const d = await (await usageCol()).findOne({ userId, day });
  return { day, count: d?.count ?? 0 };
}

export async function bumpUsage(userId: string, now: Date = new Date()): Promise<void> {
  const day = istDay(now);
  const col = await usageCol();
  const existing = await col.findOne({ userId, day });
  if (existing) await col.updateOne({ _id: existing._id }, { $set: { count: existing.count + 1 } });
  else await col.insertOne({ _id: new ObjectId(), userId, day, count: 1 });
}

/** Analysts waiting for their first memo, oldest first. */
export async function listInitializing(limit: number, onlyUserId?: string): Promise<AnalystRecord[]> {
  const docs = await (await analysts()).find({ status: 'initializing', ...(onlyUserId ? { userId: onlyUserId } : {}) }).sort({ createdAt: 1 }).limit(limit).toArray();
  return docs.map(toRecord);
}

/** Active analysts whose end-of-day check is due, least recently checked first. */
export async function listDueForHeartbeat(now: Date, limit: number, onlyUserId?: string): Promise<AnalystRecord[]> {
  const docs = await (await analysts()).find({ status: 'active', ...(onlyUserId ? { userId: onlyUserId } : {}) }).sort({ lastCheckedAt: 1 }).limit(limit * 4).toArray();
  return docs.filter((d) => isHeartbeatDue(d.lastCheckedAt, now)).slice(0, limit).map(toRecord);
}

export async function deleteAnalyst(userId: string, symbol: string): Promise<boolean> {
  const s = symbol.toUpperCase();
  const res = await (await analysts()).deleteOne({ userId, symbol: s });
  await (await journal()).deleteMany({ userId, symbol: s });
  return (res.deletedCount ?? 0) > 0;
}

/** Every (user, symbol) that holds a stock, for backfilling analysts for holdings that existed before this feature. */
export async function listHoldingPairs(limit: number, onlyUserId?: string): Promise<Array<{ userId: string; symbol: string }>> {
  const docs = await (await getDb()).collection<{ userId: string; symbol: string }>('holdings').find(onlyUserId ? { userId: onlyUserId } : {}, { projection: { userId: 1, symbol: 1 } }).limit(limit).toArray();
  return docs.map((d) => ({ userId: d.userId, symbol: String(d.symbol).toUpperCase() }));
}
