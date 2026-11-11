'use client';

import { useState } from 'react';
import type { Ipo } from '@/lib/dashboard/iposApi';
import { ipoPhase } from '@/lib/dashboard/ipoFilters';
import { gmpView, ipoBadge, issueSizeText, lotText, priceText, subscriptionView, timeline } from '@/lib/dashboard/ipoView';
import { IpoDetails } from './IpoDetails';
import { IpoTimeline } from './IpoTimeline';
import styles from './IpoCard.module.css';

interface IpoCardProps {
  readonly ipo: Ipo;
  /** Today's date in India (YYYY-MM-DD). */
  readonly today: string;
  readonly aiKeyAvailable: boolean;
}

/** One IPO with the numbers a retail investor decides on visible at once: GMP, status, price, lot, size, subscription, timeline. */
export function IpoCard({ ipo, today, aiKeyAvailable }: IpoCardProps) {
  const [open, setOpen] = useState(false);
  const badge = ipoBadge(ipo, today);
  const gmp = gmpView(ipo);
  const sub = subscriptionView(ipo);
  // The premium is a pre-listing signal: once an IPO has listed it no longer applies.
  const showGmp = ipoPhase(ipo, today) !== 'listed';

  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <div className={styles.title}>
          <h3 className={styles.name}>{ipo.name}</h3>
          <div className={styles.badges}>
            <span className={styles.type}>{ipo.category === 'sme' ? 'SME' : 'Mainboard'}</span>
            <span className={`${styles.status} ${styles[`status_${badge.tone}`]}`}>{badge.label}</span>
          </div>
        </div>
        {showGmp && (
          <span
            className={`${styles.gmp} ${styles[`gmp_${gmp.tone}`]}`}
            title="Unofficial grey-market premium: not from any exchange"
          >
            {gmp.text}
          </span>
        )}
      </div>

      <dl className={styles.stats}>
        <div>
          <dt>Issue price</dt>
          <dd>{priceText(ipo)}</dd>
        </div>
        <div>
          <dt>Lot size</dt>
          <dd>{lotText(ipo)}</dd>
        </div>
        <div>
          <dt>Issue size</dt>
          <dd>{issueSizeText(ipo)}</dd>
        </div>
        <div>
          <dt>Subscribed</dt>
          <dd className={sub.tone === 'over' ? styles.over : sub.tone === 'under' ? styles.under : ''}>{sub.text}</dd>
        </div>
      </dl>

      <div className={styles.foot}>
        <IpoTimeline milestones={timeline(ipo, today)} />
        <button type="button" className={styles.more} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Hide details' : 'Details & alerts'} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open && <IpoDetails ipo={ipo} aiKeyAvailable={aiKeyAvailable} />}
    </li>
  );
}
