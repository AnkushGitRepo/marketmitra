import { getDb } from '@/lib/mongodb';

interface BehaviourDocument {
  userId: string;
  lastDipAt: Date;
}

async function col() {
  return (await getDb()).collection<BehaviourDocument>('advisor_behaviour');
}

export async function getLastDipAt(userId: string): Promise<string | null> {
  const doc = await (await col()).findOne({ userId });
  return doc ? doc.lastDipAt.toISOString() : null;
}

export async function markDipServed(userId: string, at: Date): Promise<void> {
  await (await col()).updateOne({ userId }, { $set: { lastDipAt: at } }, { upsert: true });
}
