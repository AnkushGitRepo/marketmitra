import { getPreferences } from '@/lib/preferences/store';
import { ensureAnalystIndexes, spawnAnalyst } from './store';

/** A new holding gets an analyst unless the user turned automatic analysts off. Best effort: it must never fail adding a holding. */
export async function autoSpawnForHolding(userId: string, symbol: string): Promise<void> {
  try {
    const prefs = await getPreferences(userId);
    if (!prefs.agents.auto) return;
    await ensureAnalystIndexes().catch(() => undefined);
    await spawnAnalyst(userId, symbol, 'holding');
  } catch {
    /* the cron backfills any holding that is missed here */
  }
}
