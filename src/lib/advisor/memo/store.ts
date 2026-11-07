import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { ScreenResult } from '../screen/types';
import type { KillCriterion, Memo, SourceRef } from './types';

export interface StoredMemo {
  id: string;
  symbol: string;
  name: string;
  createdAt: string;
  promptVersion: string;
  model: string;
  attempts: number;
  /** The screen result the memo was written against. */
  screen: ScreenResult;
  /** True if the memo was requested for a stock the screen did not clear. */
  screenOverridden: boolean;
  memo: Memo;
  /** Code-supplied exit triggers, added to the memo's own. */
  baselineKillCriteria: Array<Omit<KillCriterion, 'rationale'>>;
  /** The exact material the citations were checked against — kept for audit. */
  sources: SourceRef[];
}

interface MemoDocument extends Omit<StoredMemo, 'id' | 'createdAt'> {
  userId: string;
  createdAt: Date;
}

async function memos() {
  return (await getDb()).collection<MemoDocument>('advisor_memos');
}

export async function saveMemo(userId: string, m: Omit<StoredMemo, 'id' | 'createdAt'>): Promise<StoredMemo> {
  const createdAt = new Date();
  const res = await (await memos()).insertOne({ ...m, userId, createdAt });
  return { ...m, id: res.insertedId.toString(), createdAt: createdAt.toISOString() };
}

export async function latestMemo(userId: string, symbol: string): Promise<StoredMemo | null> {
  const doc = await (await memos()).findOne({ userId, symbol }, { sort: { createdAt: -1 } });
  if (!doc) return null;
  const { userId: _u, createdAt, _id, ...rest } = doc as MemoDocument & { _id: { toString(): string } };
  void _u;
  return { ...rest, id: _id.toString(), createdAt: createdAt.toISOString() };
}

export async function getMemoById(userId: string, id: string): Promise<StoredMemo | null> {
  if (!ObjectId.isValid(id)) return null;
  const doc = await (await memos()).findOne({ _id: new ObjectId(id), userId } as never);
  if (!doc) return null;
  const { userId: _u, createdAt, _id, ...rest } = doc as MemoDocument & { _id: { toString(): string } };
  void _u;
  return { ...rest, id: _id.toString(), createdAt: createdAt.toISOString() };
}
