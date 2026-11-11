import { getCurrentUserId } from '@/lib/currentUserId';
import { AnalystDesk } from '@/components/analysts/AnalystDesk';
import { logEvent } from '@/lib/system/eventLog';
import { RosterUnavailable } from '@/components/analysts/RosterUnavailable';
import type { DeskData } from '@/lib/analysts/desk';
import { loadDeskData } from '@/lib/analysts/deskData';
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
      return await loadDeskData(userId);
    } catch (err) {
      // The cause (usually a database connection error) is logged by name only, so the next failure can be diagnosed without leaking content.
      await logEvent({ level: 'error', source: 'page:agents', message: `Analyst roster failed to load: ${err instanceof Error ? err.name : 'Error'}` }).catch(() => undefined);
      return null;
    }
  })();

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Agents</p>
      <h1 className={styles.h1}>Analyst desk</h1>
      {desk ? <AnalystDesk initial={desk} /> : <RosterUnavailable />}
      <AgentsPageClient />
    </div>
  );
}
