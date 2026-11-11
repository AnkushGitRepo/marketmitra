// MongoDB store for the stock analysts (#128, ADR 0058): `stockAnalysts` (one per user and symbol), `analystJournal` and `analystUsage`.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import { istDay, isHeartbeatDue, type Usage } from './caps';
import { applyCriterionAction, type CriterionAction } from './criteria';
import { afterFailure, isAutoRetryable, MAX_AUTO_RETRIES } from './retry';
import type { AnalystRecord } from './engine';
import { EMPTY_WATCH, type AnalystSource, type AnalystStatus, type Dossier, type CriterionMetric, type JournalEntry, type ThesisCriterion, type WatchState } from './types';

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
  /** Absent on analysts written before thesis criteria existed. */
  criteria?: ThesisCriterion[] | null;
  /** Automatic retries after unexpected failures (#148). Absent on older records. */
  retryCount?: number;
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
  createdAt: d.createdAt,
  criteria: d.criteria ?? null,
  retryCount: d.retryCount ?? 0,
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

/** Records one unexpected failure: back in the queue while attempts remain, stalled once they are used up. Returns the new status. */
export async function markFailure(userId: string, symbol: string, now: Date = new Date()): Promise<AnalystStatus | null> {
  const record = await getAnalyst(userId, symbol);
  if (!record) return null;
  const next = afterFailure(record.retryCount);
  await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { status: next.status, statusNote: next.note, retryCount: next.retryCount, updatedAt: now } });
  return next.status;
}

/** Puts analysts stalled by an unexpected exception (including those the old sweep left behind) back in the queue. Returns how many. */
export async function requeueRetryable(onlyUserId?: string, now: Date = new Date()): Promise<number> {
  const col = await analysts();
  const stalled = await col.find({ status: 'error', dossier: null, ...(onlyUserId ? { userId: onlyUserId } : {}) }).toArray();
  let n = 0;
  for (const d of stalled) {
    const r = toRecord(d);
    if (!isAutoRetryable({ status: r.status, hasDossier: false, statusNote: r.statusNote, retryCount: r.retryCount })) continue;
    await col.updateOne({ _id: d._id }, { $set: { status: 'initializing', statusNote: `Retrying after a temporary error (attempt ${r.retryCount + 2} of ${MAX_AUTO_RETRIES}).`, retryCount: r.retryCount + 1, updatedAt: now } });
    n += 1;
  }
  return n;
}

/** "Retry all stalled": puts every one of the user's stalled analysts (no dossier, status error) back in the queue, so the sweep rebuilds them one at a time. Returns how many. */
export async function requeueStalled(userId: string, now: Date = new Date()): Promise<number> {
  const col = await analysts();
  const stalled = await col.find({ userId, status: 'error', dossier: null }).toArray();
  for (const d of stalled) await col.updateOne({ _id: d._id }, { $set: { status: 'initializing', statusNote: 'Re-queued to retry.', retryCount: 0, updatedAt: now } });
  return stalled.length;
}

export async function saveDossier(userId: string, symbol: string, dossier: Dossier, watch: WatchState, now: Date = new Date()): Promise<void> {
  await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { dossier, watch, status: 'active', statusNote: null, retryCount: 0, lastCheckedAt: now, updatedAt: now } });
}

export async function saveCheck(userId: string, symbol: string, watch: WatchState, lastCheckedAt: Date): Promise<void> {
  await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { watch, lastCheckedAt, updatedAt: lastCheckedAt } });
}

export async function saveCriteria(userId: string, symbol: string, criteria: ThesisCriterion[]): Promise<void> {
  await (await analysts()).updateOne({ userId, symbol: symbol.toUpperCase() }, { $set: { criteria, updatedAt: new Date() } });
}

/** Switches one of the analyst's criteria on or off, or removes it. Returns the new list, or null when the analyst or criterion does not exist. */
export async function updateCriterion(userId: string, symbol: string, id: CriterionMetric, action: CriterionAction): Promise<ThesisCriterion[] | null> {
  const record = await getAnalyst(userId, symbol);
  const next = record?.criteria ? applyCriterionAction(record.criteria, id, action) : null;
  if (next) await saveCriteria(userId, symbol, next);
  return next;
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

/** How many events each analyst has logged (the initiation entry is not an event), for the roster. */
export async function countEvents(userId: string, symbols: readonly string[]): Promise<Record<string, number>> {
  if (symbols.length === 0) return {};
  const rows = await (await journal())
    .aggregate<{ _id: string; n: number }>([{ $match: { userId, symbol: { $in: symbols.map((s) => s.toUpperCase()) }, kind: { $ne: 'initiation' } } }, { $group: { _id: '$symbol', n: { $sum: 1 } } }])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
}

/** Every journal entry the user's analysts logged since `since`, newest first, for the morning dispatch. */
export async function recentEntries(userId: string, since: Date, limit = 400): Promise<JournalEntry[]> {
  const docs = await (await journal()).find({ userId, ts: { $gte: since } }).sort({ ts: -1 }).limit(limit).toArray();
  return docs.map(toEntry);
}

/** Users with at least one vigilant analyst. */
export async function listUsersWithActiveAnalysts(onlyUserId?: string): Promise<string[]> {
  return (await analysts()).distinct('userId', { status: 'active', ...(onlyUserId ? { userId: onlyUserId } : {}) });
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
