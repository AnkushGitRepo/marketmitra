import { getDb } from '@/lib/mongodb';
import { DEFAULT_PREFERENCES, applyPatch, resolvePreferences, type Preferences, type PreferencesPatch } from './schema';

interface PreferencesDoc {
  userId: string;
  prefs: unknown;
  updatedAt: Date;
}

async function collection() {
  const db = await getDb();
  return db.collection<PreferencesDoc>('userPreferences');
}

/** Never throws: a database hiccup falls back to defaults rather than breaking every page. */
export async function getPreferences(userId: string | null): Promise<Preferences> {
  if (!userId) return DEFAULT_PREFERENCES;
  try {
    const doc = await (await collection()).findOne({ userId });
    return resolvePreferences(doc?.prefs);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function updatePreferences(userId: string, patch: PreferencesPatch): Promise<Preferences> {
  const next = applyPatch(await getPreferences(userId), patch);
  await (await collection()).updateOne({ userId }, { $set: { prefs: next, updatedAt: new Date() } }, { upsert: true });
  return next;
}
