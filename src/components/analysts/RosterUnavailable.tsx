'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from './RosterUnavailable.module.css';

/** Shown when the analyst roster cannot be loaded (usually a brief database connection problem). One click tries again. */
export function RosterUnavailable() {
  const router = useRouter();
  const [reloading, setReloading] = useState(false);

  const reload = () => {
    setReloading(true);
    router.refresh();
    // refresh() has no completion signal; the page re-renders with the roster or this card again.
    setTimeout(() => setReloading(false), 1500);
  };

  return (
    <section className={styles.card} role="alert" aria-label="Analyst roster unavailable">
      <h2 className={styles.title}>Unable to load your analysts</h2>
      <p className={styles.text}>A network or database hiccup stopped the roster from loading. Your analysts and journals are not affected. Try again in a moment.</p>
      <button type="button" className={styles.button} disabled={reloading} onClick={reload}>
        {reloading ? 'Reloading…' : 'Reload roster'}
      </button>
    </section>
  );
}
