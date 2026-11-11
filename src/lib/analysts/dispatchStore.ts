// MongoDB store for the saved morning briefs (#129): one per user per India day, which is also what keeps a re-run from sending twice.

import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { Dispatch } from './dispatch';

export type DispatchEmail = 'sent' | 'skipped' | 'failed';

export interface StoredDispatch {
  day: string;
  title: string;
  body: string;
  dispatch: Dispatch;
  email: DispatchEmail;
  emailDetail: string | null;
  createdAt: string;
}

interface DispatchDoc extends Omit<StoredDispatch, 'createdAt'> {
  _id: ObjectId;
  userId: string;
  createdAt: Date;
}

const col = async () => (await getDb()).collection<DispatchDoc>('analystDispatches');

export async function ensureDispatchIndexes(): Promise<void> {
  await (await col()).createIndexes([{ key: { userId: 1, day: 1 }, name: 'user_day_unique', unique: true }]);
}

const toStored = (d: DispatchDoc): StoredDispatch => ({ day: d.day, title: d.title, body: d.body, dispatch: d.dispatch, email: d.email, emailDetail: d.emailDetail, createdAt: d.createdAt.toISOString() });

export async function hasDispatch(userId: string, day: string): Promise<boolean> {
  return (await (await col()).countDocuments({ userId, day }, { limit: 1 })) > 0;
}

/** Saves today's brief. Returns false when one already exists for that day (the unique index), so the caller never sends twice. */
export async function saveDispatch(userId: string, stored: Omit<StoredDispatch, 'createdAt'>, now: Date): Promise<boolean> {
  try {
    await (await col()).insertOne({ _id: new ObjectId(), userId, ...stored, createdAt: now });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return false;
    throw err;
  }
}

export async function latestDispatch(userId: string): Promise<StoredDispatch | null> {
  const d = await (await col()).find({ userId }).sort({ day: -1 }).limit(1).next();
  return d ? toStored(d) : null;
}

export async function setDispatchOutcome(userId: string, day: string, email: DispatchEmail, detail: string | null): Promise<void> {
  await (await col()).updateOne({ userId, day }, { $set: { email, emailDetail: detail } });
}
