import { getCurrentUserId } from '@/lib/currentUserId';
import { AnalystDesk, type DeskData } from '@/components/analysts/AnalystDesk';
import { DAILY_AI_CAP } from '@/lib/analysts/caps';
import { getUsage, latestEntries, listAnalysts } from '@/lib/analysts/store';
import { getPreferences } from '@/lib/preferences/store';
import { AgentsPageClient } from './AgentsPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to run a multi-agent analysis.</p>
      </div>
    );
  }

  // The roster is best effort: if it cannot be read the one-off analysis below still works.
  const desk: DeskData | null = await (async () => {
    try {
      const records = await listAnalysts(userId);
      const [latest, usage, prefs] = await Promise.all([latestEntries(userId, records.map((r) => r.symbol)), getUsage(userId), getPreferences(userId)]);
      return {
        auto: prefs.agents.auto,
        usage: { used: usage.count, cap: DAILY_AI_CAP },
        analysts: records.map((r) => ({
          symbol: r.symbol,
          source: r.source,
          status: r.status,
          statusNote: r.statusNote,
          hasDossier: r.dossier !== null,
          summary: r.dossier?.summary ?? null,
          lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
          latest: latest[r.symbol] ?? null,
        })),
      };
    } catch {
      return null;
    }
  })();

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Agents</p>
      <h1 className={styles.h1}>Analyst desk</h1>
      {desk ? <AnalystDesk initial={desk} /> : <p className={styles.introNote}>The analyst roster could not be loaded right now.</p>}
      <AgentsPageClient />
    </div>
  );
}
