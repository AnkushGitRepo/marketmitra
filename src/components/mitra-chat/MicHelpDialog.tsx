'use client';

import { useEffect, useRef } from 'react';
import { micGuidance } from '@/lib/mic/guidance';
import type { DictationHelp } from './useDictation';
import styles from './MicHelpDialog.module.css';

interface MicHelpDialogProps {
  readonly help: DictationHelp | null;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

/** Explains, for the user's own browser, exactly how to allow the microphone. */
export function MicHelpDialog({ help, onRetry, onClose }: MicHelpDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Native <dialog>: focus trap, Esc and focus restoration for free.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (help && !el.open) el.showModal();
    if (!help && el.open) el.close();
  }, [help]);

  const guidance = help ? micGuidance(help.problem, help.browser) : null;

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="mic-help-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {guidance && (
        <>
          <h2 id="mic-help-title" className={styles.title}>
            {guidance.title}
          </h2>
          <ol className={styles.steps}>
            {guidance.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className={styles.note}>Dictation uses your browser&rsquo;s own speech service. Nothing is recorded by MarketMitra.</p>
          <div className={styles.actions}>
            {guidance.canRetry && (
              <button type="button" className={styles.primary} onClick={onRetry}>
                Try again
              </button>
            )}
            <button type="button" className={styles.secondary} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
