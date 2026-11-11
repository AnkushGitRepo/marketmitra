import { getCurrentUserId } from '@/lib/currentUserId';
import { AnalystDesk } from '@/components/analysts/AnalystDesk';
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
