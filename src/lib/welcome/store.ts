import { getDb } from '@/lib/mongodb';
import type { WelcomeRecord, WelcomeStatus, WelcomeStore } from './sendOnce';

async function collection() {
  const db = await getDb();
  const col = db.collection<WelcomeRecord>('welcomeEmails');
  // Unique per user: this is what makes the first claim atomic across instances.
  await col.createIndex({ userId: 1 }, { unique: true }).catch(() => undefined);
  return col;
}

const DUPLICATE_KEY = 11000;

export const mongoWelcomeStore: WelcomeStore = {
  async find(userId) {
    return (await (await collection()).findOne({ userId })) ?? null;
  },

  async insertClaim(record) {
    try {
      await (await collection()).insertOne({ ...record });
      return true;
    } catch (e) {
      if ((e as { code?: number }).code === DUPLICATE_KEY) return false;
      throw e;
    }
  },

  async reclaim(userId, expected, next) {
    const res = await (await collection()).updateOne(
      { userId, updatedAt: expected },
      { $set: { status: next.status, attempts: next.attempts, updatedAt: next.updatedAt } }
    );
    return res.modifiedCount === 1;
  },

  async setStatus(userId, status: WelcomeStatus, now, error) {
    const col = await collection();
    await col.updateOne({ userId }, error ? { $set: { status, updatedAt: now, lastError: error } } : { $set: { status, updatedAt: now }, $unset: { lastError: '' } });
  },
};
