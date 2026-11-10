import { getCurrentUserId } from '@/lib/currentUserId';
import { ResearchPageClient } from './ResearchPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function ResearchPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to run a research brief.</p>
      </div>
    );
  }
  return <ResearchPageClient />;
}
