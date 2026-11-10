'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useTransition, type ReactNode } from 'react';
import styles from './DataUnavailable.module.css';

/** Automatic re-checks (ms after the previous one) before we leave it to the user's button. */
export const AUTO_RETRY_DELAYS_MS: readonly number[] = [4_000, 10_000];

interface DataUnavailableProps {
  readonly children: ReactNode;
  /** Re-check on its own a couple of times (default). */
  readonly autoRetry?: boolean;
}

/**
 * The fail-safe for a server-rendered section whose data source didn't answer: instead of a dead-end sentence it
 * re-checks a couple of times by itself, and always offers "Try again" (which re-runs the server render).
 */
export function DataUnavailable({ children, autoRetry = true }: DataUnavailableProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [autoAttempts, setAutoAttempts] = useState(0);

  const retry = useCallback(() => startTransition(() => router.refresh()), [router]);

  useEffect(() => {
    if (!autoRetry || autoAttempts >= AUTO_RETRY_DELAYS_MS.length) return;
    const timer = window.setTimeout(() => {
      setAutoAttempts((n) => n + 1);
      retry();
    }, AUTO_RETRY_DELAYS_MS[autoAttempts]);
    return () => window.clearTimeout(timer);
  }, [autoRetry, autoAttempts, retry]);

  return (
    <div className={styles.box} role="alert">
      <p className={styles.text}>{children}</p>
      <div className={styles.row}>
        <button type="button" className={styles.btn} onClick={retry} disabled={pending}>
          {pending ? 'Checking…' : 'Try again'}
        </button>
        {autoRetry && autoAttempts < AUTO_RETRY_DELAYS_MS.length && <span className={styles.hint}>Checking again automatically…</span>}
      </div>
    </div>
  );
}
