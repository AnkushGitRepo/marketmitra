import { getCurrentUserId } from '@/lib/currentUserId';
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
  return <AgentsPageClient />;
}
