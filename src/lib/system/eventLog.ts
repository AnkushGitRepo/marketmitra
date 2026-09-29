// System event log (ADR 0029) — a small, best-effort record of operational
// events: cron job runs today, more sources later if they earn it. Backs
// the "Logs" feed on /dashboard/system. Deliberately not a general-purpose
// app log: writing here must never be able to break the caller (see
// `logEvent`'s catch-and-drop), and the collection self-prunes via a TTL
// index so it can't grow unbounded.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';

export type EventLevel = 'info' | 'warn' | 'error';

export interface SystemEvent {
  id: string;
  ts: Date;
  level: EventLevel;
  /** e.g. 'cron:evaluate-alerts' */
  source: string;
  message: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

interface SystemEventDoc {
  _id: ObjectId;
  ts: Date;
  level: EventLevel;
  source: string;
  message: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

export const RETENTION_DAYS = 30;

function toEvent(doc: SystemEventDoc): SystemEvent {
  return {
    id: doc._id.toString(),
    ts: doc.ts,
    level: doc.level,
    source: doc.source,
    message: doc.message,
    durationMs: doc.durationMs,
    meta: doc.meta,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<SystemEventDoc>('systemEvents');
}

export async function ensureEventLogIndexes(): Promise<void> {
  const col = await collection();
  await col.createIndexes([
    { key: { ts: -1 }, name: 'ts_desc' },
    { key: { source: 1, ts: -1 }, name: 'source_ts' },
    { key: { ts: 1 }, name: 'ttl', expireAfterSeconds: RETENTION_DAYS * 86400 },
  ]);
}

export interface LogEventInput {
  level: EventLevel;
  source: string;
  message: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
}

/** Best-effort: a logging failure must never break the caller (a cron run,
 * an API route). Swallows and drops rather than throwing. */
export async function logEvent(input: LogEventInput): Promise<void> {
  try {
    const col = await collection();
    await col.insertOne({ _id: new ObjectId(), ts: new Date(), ...input });
  } catch {
    /* best-effort only */
  }
}

export interface ListEventsOptions {
  level?: EventLevel;
  source?: string;
  limit?: number;
  /** cursor pagination: events strictly before this timestamp */
  before?: Date;
}

export async function listEvents(opts: ListEventsOptions = {}): Promise<SystemEvent[]> {
  const col = await collection();
  const filter: Record<string, unknown> = {};
  if (opts.level) filter.level = opts.level;
  if (opts.source) filter.source = opts.source;
  if (opts.before) filter.ts = { $lt: opts.before };
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  const docs = await col.find(filter).sort({ ts: -1 }).limit(limit).toArray();
  return docs.map(toEvent);
}

/** The most recent event for each of `sources`, in the order given. `null`
 * where a source has never logged anything yet. One query per source —
 * fine at this scale (a handful of cron sources), and keeps the result
 * trivially in the caller's requested order. */
export async function latestEventPerSource(sources: string[]): Promise<Record<string, SystemEvent | null>> {
  const col = await collection();
  const out: Record<string, SystemEvent | null> = {};
  for (const source of sources) {
    const doc = await col.find({ source }).sort({ ts: -1 }).limit(1).toArray();
    out[source] = doc[0] ? toEvent(doc[0]) : null;
  }
  return out;
}
