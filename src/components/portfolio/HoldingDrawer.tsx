'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { relativeTime } from '@/components/dashboard-charts/NewsList';
import { ThesisCard } from '@/components/stock/ThesisCard';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import { safeHref } from '@/lib/security/safeHref';
import { stockHref } from '@/lib/stock/href';
import styles from './HoldingDrawer.module.css';

interface HoldingDrawerProps {
  readonly holding: EnrichedHolding;
  readonly news: readonly NewsItem[];
  readonly onClose: () => void;
}

const MAX_NEWS = 5;

/** A holding's detail without leaving /portfolio: entry date and thesis, the decisions recorded on it, and its own news. */
export function HoldingDrawer({ holding, news, onClose }: HoldingDrawerProps) {
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const symbol = holding.symbol.toUpperCase();
  const stories = news.filter((n) => n.symbols.some((s) => s.toUpperCase() === symbol)).slice(0, MAX_NEWS);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input, select, [tabindex="0"]');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [onClose]);

  // Portalled to the body: an ancestor with a transform or filter would otherwise turn `position: fixed` into "fixed to that card".
  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-label={`${holding.name} details`} onClick={(e) => e.stopPropagation()}>
        <header className={styles.head}>
          <div>
            <p className={styles.symbol}>{symbol}</p>
            <h2 className={styles.name}>{holding.name}</h2>
          </div>
          <button ref={closeRef} type="button" className={styles.close} aria-label="Close details" onClick={onClose}>×</button>
        </header>

        <ThesisCard symbol={symbol} />

        <section className={styles.news} aria-label={`News about ${symbol}`}>
          <h3 className={styles.h3}>News about {symbol}</h3>
          {stories.length === 0 ? (
            <p className={styles.muted}>No recent stories tag this stock.</p>
          ) : (
            <ul className={styles.list}>
              {stories.map((n) => (
                <li key={n.url}>
                  <a href={safeHref(n.url)} target="_blank" rel="noopener noreferrer" className={styles.story}>{n.title}</a>
                  <span className={`${styles.tone} ${styles[`tone_${n.sentiment}`]}`}>{n.sentiment}</span>
                  <span className={styles.muted}> {n.source} · {relativeTime(n.published_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link href={stockHref(symbol)} className={styles.full}>Open the full {symbol} page →</Link>
      </aside>
    </div>,
    document.body
  );
}
