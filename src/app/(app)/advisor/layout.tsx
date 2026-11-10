import { notFound } from 'next/navigation';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { hasAcknowledged } from '@/lib/advisor/policy/store';
import { AcknowledgeGate } from '@/components/advisor/AcknowledgeGate';
import { AdvisorSubNav } from '@/components/advisor/AdvisorSubNav';
import { DisclaimerBanner } from '@/components/advisor/Disclaimer';
import styles from '@/components/advisor/advisor.module.css';

export const dynamic = 'force-dynamic';

export default async function AdvisorLayout({ children }: { children: React.ReactNode }) {
  if (!isAdvisorEnabled()) notFound();
  const userId = await getCurrentUserId();
  if (!userId) notFound();

  const accepted = await hasAcknowledged(userId).catch(() => false);
  if (!accepted) {
    return (
      <div className={styles.pageRoot}>
        <AcknowledgeGate />
      </div>
    );
  }
  return (
    <div className={styles.pageRoot}>
      <DisclaimerBanner />
      <AdvisorSubNav />
      {children}
    </div>
  );
}
