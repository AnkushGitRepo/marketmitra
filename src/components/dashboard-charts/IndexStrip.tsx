'use client';

import { useRouter } from 'next/navigation';
import { IndexCard } from './IndexCard';
import type { IndexQuoteOut } from '@/lib/dashboard/fundamentalsApi';
import { orderIndices } from '@/lib/dashboard/indexOrder';
import styles from './IndexStrip.module.css';

/** NIFTY 50, SENSEX, NIFTY BANK, INDIA VIX in one balanced row; a swipeable carousel on phones. */
export function IndexStrip({ indices }: { readonly indices: readonly IndexQuoteOut[] }) {
  const router = useRouter();
  const ordered = orderIndices(indices);

  return (
    <section className={styles.section} aria-label="Today’s market">
      <div className={styles.head}>
        <h2 className={styles.h2}>Today&rsquo;s market</h2>
        <button type="button" className={styles.link} onClick={() => router.push('/markets')}>
          Open Markets →
        </button>
      </div>
      {ordered.length > 0 ? (
        // tabIndex so keyboard users can scroll the carousel; the cards themselves are links.
        <div className={styles.strip} role="list" tabIndex={0} aria-label="Market indices">
          {ordered.map((ix) => (
            <div key={ix.name} className={styles.cell} role="listitem">
              <IndexCard index={ix} />
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Index data is temporarily unavailable.</p>
      )}
    </section>
  );
}
