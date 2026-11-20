'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { compareHref, MAX_COMPARE } from '@/lib/funds/compare';
import { useCompareSelection } from './useCompareSelection';
import styles from './CompareDock.module.css';

const MIN_TO_COMPARE = 2;

/** A bar pinned to the bottom of the funds pages while funds are picked. */
export function CompareDock() {
  const pathname = usePathname();
  const compare = useCompareSelection();
  const count = compare.selected.length;
  const visible = count > 0 && pathname !== '/funds/compare';
  const ready = count >= MIN_TO_COMPARE;

  return (
    <>
      {/* Always mounted, so a screen reader hears the count change instead of a new region appearing. */}
      <p className={styles.live} role="status">
        {count === 0 ? '' : `${count} of ${MAX_COMPARE} funds picked to compare${ready ? '' : ', pick one more'}`}
      </p>
      {visible && (
        <aside className={styles.dock} aria-label="Funds to compare">
          <ul className={styles.picks}>
            {compare.selected.map((item) => (
              <li key={item.scheme_code} className={styles.pick}>
                <span className={styles.name} title={item.name}>{item.name}</span>
                <button type="button" className={styles.remove} aria-label={`Remove ${item.name}`} onClick={() => compare.remove(item.scheme_code)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className={styles.count} aria-hidden="true">
            {count} of {MAX_COMPARE}
            {ready ? '' : ' · pick one more'}
          </p>
          <button type="button" className={styles.clear} onClick={compare.clear}>Clear</button>
          {ready ? (
            <Link className={styles.go} href={compareHref(compare.selected.map((s) => s.scheme_code))}>Compare side by side</Link>
          ) : (
            <button type="button" className={`${styles.go} ${styles.goOff}`} disabled>Compare side by side</button>
          )}
        </aside>
      )}
    </>
  );
}
