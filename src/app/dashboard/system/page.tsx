import { getCurrentUserId } from '@/lib/currentUserId';
import { getSystemStatus } from '@/lib/system/health';
import { listEvents } from '@/lib/system/eventLog';
import { SystemPageClient } from './SystemPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function SystemPage() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.introNote}>Sign in to view system status.</p>
      </div>
    );
  }

  const status = await getSystemStatus();

  let events: Awaited<ReturnType<typeof listEvents>> = [];
  try {
    events = await listEvents({ limit: 50 });
  } catch {
    // Mongo unreachable — render the shell with an empty log rather than 500.
    // The status cards above already surface a "down" MongoDB component in
    // this case, so the empty log here isn't a silent failure.
  }

  return <SystemPageClient initialStatus={status} initialEvents={events} />;
}
