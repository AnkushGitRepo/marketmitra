'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TONE_LABEL, statusTone, type FooterTone } from '@/lib/system/statusTone';
import styles from './AppFooter.module.css';

const REFRESH_MS = 120_000;

/** Slim app footer: live health dot linking to the public status page, plus legal and API links. */
export function AppFooter() {
  const [tone, setTone] = useState<FooterTone>('unknown');

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch('/api/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { data?: { overall?: unknown } } | null) => {
          if (alive) setTone(statusTone(j?.data?.overall));
        })
        .catch(() => {
          if (alive) setTone('unknown');
        });
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <footer className={styles.footer}>
      <Link href="/status" className={styles.status} title={TONE_LABEL[tone]}>
        <span className={`${styles.dot} ${styles[`dot_${tone}`]}`} aria-hidden="true" />
        <span>Status</span>
        <span className={styles.srOnly}>: {TONE_LABEL[tone]}</span>
      </Link>
      <nav className={styles.links} aria-label="Footer">
        <Link href="/api-docs">API</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
      <span className={styles.note}>MarketMitra · not investment advice</span>
    </footer>
  );
}
