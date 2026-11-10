import { getCurrentUserId } from '@/lib/currentUserId';
import { listHoldings } from '@/lib/holdings';
import { getNews } from '@/lib/dashboard/newsApi';
import { NewsFeedClient } from './NewsFeedClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function NewsPage() {
  const userId = await getCurrentUserId();

  let holdingSymbols: string[] = [];
  if (userId) {
    try {
      holdingSymbols = [...new Set((await listHoldings(userId)).map((h) => h.symbol.toUpperCase()))];
    } catch {
      holdingSymbols = [];
    }
  }

  const initial = await getNews({ limit: 20 });

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>News</p>
      <h1 className={styles.h1}>Markets news</h1>
      <p className={styles.introNote}>
        Headlines from Indian markets outlets and Google News, newest first. The coloured dot is
        a rough <em>headline tone</em> read (VADER) — not analysis, and not a signal.
      </p>

      <div className={styles.card}>
        <NewsFeedClient initial={initial} holdingSymbols={holdingSymbols} />
      </div>
    </div>
  );
}
