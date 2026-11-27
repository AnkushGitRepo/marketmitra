// Purchase dates (#414), kept beside the holdings rather than in them: a holding stores only a quantity and an
// average price. One date per holding, so a position bought in several tranches is treated as one lot bought on that
// date. A holding that was removed leaves its date behind unused; it is ignored because no holding matches it.

import { getDb } from '@/lib/mongodb';

interface DateDoc {
  userId: string;
  holdingId: string;
  purchaseDate: string;
  updatedAt: Date;
}

async function collection() {
  return (await getDb()).collection<DateDoc>('holdingPurchaseDates');
}

/** holdingId -> YYYY-MM-DD. */
export async function listPurchaseDates(userId: string): Promise<Record<string, string>> {
  const col = await collection();
  const docs = await col.find({ userId }).toArray();
  return Object.fromEntries(docs.map((d) => [d.holdingId, d.purchaseDate]));
}

/** Sets the date, or clears it with null. */
export async function setPurchaseDate(userId: string, holdingId: string, purchaseDate: string | null): Promise<void> {
  const col = await collection();
  if (purchaseDate === null) {
    await col.deleteOne({ userId, holdingId });
    return;
  }
  await col.updateOne({ userId, holdingId }, { $set: { purchaseDate, updatedAt: new Date() } }, { upsert: true });
}
