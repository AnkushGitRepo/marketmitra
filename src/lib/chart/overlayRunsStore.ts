// Saved AI Auto-Chart runs in MongoDB (#253), one document per generation, per user, stock and timeframe. Server-only.

import { ObjectId } from 'mongodb';
import type { PromptMode } from '@/lib/ai/promptMode';
import { getDb } from '@/lib/mongodb';
import type { ChartOverlay } from './aiOverlay';
import { idsToPrune, type OverlayRun } from './overlayRuns';
import type { Timeframe } from './timeframes';

interface RunDoc {
  _id: ObjectId;
  userId: string;
  symbol: string;
  interval: Timeframe;
  mode: PromptMode;
  overlay: ChartOverlay;
  model: string;
  lastClose: number;
  createdAt: Date;
}

async function collection() {
  const db = await getDb();
  const col = db.collection<RunDoc>('chart_overlay_runs');
  await col
    .createIndex({ userId: 1, symbol: 1, interval: 1, createdAt: -1 })
    .catch(() => undefined);
  return col;
}

const toRun = (d: RunDoc): OverlayRun => ({
  id: d._id.toHexString(),
  symbol: d.symbol,
  interval: d.interval,
  mode: d.mode,
  overlay: d.overlay,
  model: d.model,
  lastClose: d.lastClose,
  createdAt: d.createdAt.toISOString(),
});

/** The user's saved runs for one stock and timeframe, newest first. */
export async function listRuns(
  userId: string,
  symbol: string,
  interval: Timeframe,
): Promise<OverlayRun[]> {
  const docs = await (
    await collection()
  )
    .find({ userId, symbol, interval })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(toRun);
}

export interface NewRun {
  userId: string;
  symbol: string;
  interval: Timeframe;
  mode: PromptMode;
  overlay: ChartOverlay;
  model: string;
  lastClose: number;
}

/** Saves a run and drops the oldest beyond the per-view limit. Returns the saved run. */
export async function saveRun(input: NewRun, now: Date = new Date()): Promise<OverlayRun> {
  const col = await collection();
  const doc: RunDoc = { _id: new ObjectId(), ...input, createdAt: now };
  await col.insertOne(doc);
  const ids = (
    await col
      .find(
        { userId: input.userId, symbol: input.symbol, interval: input.interval },
        { projection: { _id: 1 } },
      )
      .sort({ createdAt: -1 })
      .toArray()
  ).map((d) => d._id);
  const stale = idsToPrune(ids.map((id) => id.toHexString()));
  if (stale.length > 0)
    await col.deleteMany({
      _id: { $in: stale.map((id) => new ObjectId(id)) },
      userId: input.userId,
    });
  return toRun(doc);
}

/** Deletes one of the user's own runs. False when there is no such run for this user (another user's id looks the same as a missing one). */
export async function deleteRun(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const result = await (await collection()).deleteOne({ _id: new ObjectId(id), userId });
  return result.deletedCount === 1;
}
