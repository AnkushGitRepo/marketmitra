'use client';

import Link from 'next/link';
import type { Ipo } from '@/lib/dashboard/iposApi';
import styles from './IpoOpenCard.module.css';

function gmp(ipo: Ipo): string {
  if (ipo.gmp === null) return 'GMP —';
  const pct = ipo.gmp_pct !== null ? ` (${ipo.gmp_pct >= 0 ? '+' : ''}${ipo.gmp_pct}%)` : '';
  return `₹${ipo.gmp}${pct}`;
}

function closeText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return `closes ${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`;
}

/** Compact "IPOs open now" card for the dashboard home. GMP shown with the
 * usual "unofficial" caveat (title attr + the page it links to). */
export function IpoOpenCard({ openIpos }: { openIpos: Ipo[] }) {
  // Nothing open: a one-line status, not a full empty card.
  if (openIpos.length === 0) {
    return (
      <p className={styles.banner}>
        <span>No IPOs open for subscription right now.</span>
        <Link href="/ipos" className={styles.link}>
          Upcoming IPOs →
        </Link>
      </p>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <p className={styles.label}>IPOs open now</p>
        <Link href="/ipos" className={styles.link}>
          All IPOs →
        </Link>
      </div>

      <ul className={styles.list}>
          {openIpos.slice(0, 5).map((ipo) => (
            <li key={ipo.slug} className={styles.row}>
              <Link href="/ipos" className={styles.name}>
                {ipo.name}
                <span className={styles.tag}>{ipo.category === 'sme' ? 'SME' : 'MB'}</span>
              </Link>
              <span
                className={`${styles.gmp} ${ipo.gmp !== null && ipo.gmp < 0 ? styles.gmpNeg : ''}`}
                title="Unofficial grey-market premium — not from any exchange"
              >
                {gmp(ipo)}
              </span>
              <span className={styles.close}>{closeText(ipo.close_date)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}
