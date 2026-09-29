// Mitra activity log (ADR 0030). Every alert Mitra creates or changes on
// its own — whether the silent default-guardrail hook on a new holding, or
// Mitra acting on its own judgment from chat — is recorded here with a
// required, human-readable `reason`. This is what makes "full autonomy"
// (the user's own choice for this feature) accountable rather than
// invisible: /dashboard/mitra-activity reads this collection so nothing
// Mitra does to an alert happens without a paper trail the user can
// inspect, and undo, at any time.
//
// Deliberately excludes 'alert_deleted': Mitra never fully deletes an
// alert on its own (see guardrails.ts and chatTools.ts) — only pauses one
// — so that type doesn't exist here. A human deleting their own alert
// through the normal alerts UI is not a Mitra action and isn't logged
// here either; this collection is specifically "what did Mitra do."

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { AlertSource } from '@/lib/alerts/types';

export type MitraActionType = 'alert_created' | 'alert_updated' | 'alert_paused' | 'alert_resumed';

export interface MitraAction {
  id: string;
  userId: string;
  action: MitraActionType;
  alertId: string | null;
  symbol: string | null;
  /** Params/status snapshot before this action. Null for a fresh create. */
  before: Record<string, unknown> | null;
  /** Params/status snapshot after this action. */
  after: Record<string, unknown> | null;
  /** Why Mitra did this, in its own words — required on every entry. */
  reason: string;
  source: Extract<AlertSource, 'auto_guardrail' | 'mitra'>;
  createdAt: Date;
}

interface MitraActionDocument {
  _id: ObjectId;
  userId: string;
  action: MitraActionType;
  alertId: string | null;
  symbol: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string;
  source: Extract<AlertSource, 'auto_guardrail' | 'mitra'>;
  createdAt: Date;
}

function toMitraAction(doc: MitraActionDocument): MitraAction {
  return {
    id: doc._id.toString(),
    userId: doc.userId,
    action: doc.action,
    alertId: doc.alertId,
    symbol: doc.symbol,
    before: doc.before,
    after: doc.after,
    reason: doc.reason,
    source: doc.source,
    createdAt: doc.createdAt,
  };
}

async function collection() {
  const db = await getDb();
  return db.collection<MitraActionDocument>('mitraActions');
}

export interface LogMitraActionInput {
  userId: string;
  action: MitraActionType;
  alertId?: string | null;
  symbol?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason: string;
  source: Extract<AlertSource, 'auto_guardrail' | 'mitra'>;
}

export async function logMitraAction(input: LogMitraActionInput): Promise<MitraAction> {
  const col = await collection();
  const doc: MitraActionDocument = {
    _id: new ObjectId(),
    userId: input.userId,
    action: input.action,
    alertId: input.alertId ?? null,
    symbol: input.symbol ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    reason: input.reason,
    source: input.source,
    createdAt: new Date(),
  };
  await col.insertOne(doc);
  return toMitraAction(doc);
}

/** Most recent actions first, for /dashboard/mitra-activity. */
export async function listMitraActions(userId: string, limit = 200): Promise<MitraAction[]> {
  const col = await collection();
  const docs = await col
    .find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 500))
    .toArray();
  return docs.map(toMitraAction);
}
