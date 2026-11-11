'use client';

import Link from 'next/link';
import { formatVersion } from '@/lib/version';
import styles from './Settings.module.css';

interface AboutProps {
  readonly hosted: boolean;
  readonly isAdmin: boolean;
}

export function AboutSection({ hosted, isAdmin }: AboutProps) {
  return (
    <section id="about" className={styles.section} aria-labelledby="about-title">
      <h2 id="about-title" className={styles.sectionTitle}>About this instance</h2>
      <dl className={styles.about}>
        <dt>Version</dt>
        <dd>{formatVersion()}</dd>
        <dt>Mode</dt>
        <dd>{hosted ? 'Hosted (sign-in required)' : 'Self-hosted (single local user)'}</dd>
        <dt>Billing</dt>
        <dd>None. MarketMitra is free; AI runs on your own key.</dd>
      </dl>
      <div className={styles.links}>
        <Link className={styles.btnLink} href="/status">System status</Link>
        <Link className={styles.btnLink} href="/api-docs">API reference</Link>
        <Link className={styles.btnLink} href="/privacy">Privacy</Link>
        <Link className={styles.btnLink} href="/terms">Terms</Link>
        {isAdmin && <Link className={styles.btnLink} href="/system">System (admin)</Link>}
        {isAdmin && <Link className={styles.btnLink} href="/system/emails">Email designs (admin)</Link>}
      </div>
    </section>
  );
}
