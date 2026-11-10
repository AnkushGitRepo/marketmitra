import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { getPerformance } from '@/lib/advisor/performance/service';
import { PerformanceView } from '@/components/advisor/PerformanceView';
import styles from '@/components/advisor/advisor.module.css';

export const dynamic = 'force-dynamic';

export default async function AdvisorPerformancePage() {
  const userId = await advisorPageUser();
  if (!userId) return null;
  const out = await getPerformance(userId, new Date().toISOString().slice(0, 10)).catch(() => null);
  if (!out || !out.ok) {
    return (
      <div className={styles.card}>
        <p className={styles.muted}>{out && !out.ok ? out.error : 'Performance could not be loaded right now.'}</p>
      </div>
    );
  }
  return <PerformanceView report={out.report} benchmark={out.benchmark} />;
}
