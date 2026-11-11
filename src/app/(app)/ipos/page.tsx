import { getCurrentUserId } from '@/lib/currentUserId';
import { getIpoWatch } from '@/lib/alerts/store';
import { getIpos } from '@/lib/dashboard/iposApi';
import { istToday } from '@/lib/dashboard/ipoFilters';
import { getAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import type { IpoWatchParams } from '@/lib/alerts/types';
import { IposPageClient } from './IposPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function IposPage() {
  const userId = await getCurrentUserId();

  let watch: IpoWatchParams | null = null;
  if (userId) {
    try {
      const w = await getIpoWatch(userId);
      if (w) watch = w.params as IpoWatchParams;
    } catch {
      watch = null;
    }
  }

  const [ipos, aiKeyAvailable] = await Promise.all([
    getIpos(),
    userId ? resolveHasAiKey(getAiConfig(userId, { allowEnv: true })) : Promise.resolve(false),
  ]);

  return (
    <div className={styles.pageRoot}>
      <IposPageClient ipos={ipos} today={istToday(new Date())} initialWatch={watch} aiKeyAvailable={aiKeyAvailable} />
    </div>
  );
}
