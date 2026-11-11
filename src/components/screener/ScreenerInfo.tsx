'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './ScreenerInfo.module.css';

interface ScreenerInfoProps {
  readonly intro: string;
  readonly coverage: string | null;
}

/** The long explanatory notes, tucked behind an (i) button beside the page title. */
export function ScreenerInfo({ intro, coverage }: ScreenerInfoProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.button}
        aria-label="About this data"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <div id={id} role="note" className={styles.panel}>
          <p>{intro}</p>
          {coverage && <p data-testid="screener-coverage">{coverage}</p>}
        </div>
      )}
    </div>
  );
}
