'use client';

import { useId } from 'react';
import styles from './MitraCharacter.module.css';

export type MitraPhase = 'idle' | 'thinking' | 'writing' | 'done';

interface MitraCharacterProps {
  phase: MitraPhase;
  size?: number;
  /** Reacts a little more strongly on hover/focus of whatever hosts this
   * character (a card, a launcher button, ...) — driven by the host's own
   * hover/focus state rather than this component's own small hit area, so
   * "hover the card" and "hover the character" both feel alive. */
  active?: boolean;
}

/** Mitra's small illustrated character — a rounded mint-green body with a
 * dark visor and two eyes, standing in for the plain gradient circle the
 * AI card used before. Built once here (not inline in InsightCard) so the
 * same character can later be reused wherever Mitra appears — the
 * dashboard's floating assistant included, if that's ever unified with
 * this look — without redrawing it. */
export function MitraCharacter({ phase, size = 30, active = false }: MitraCharacterProps) {
  const gradientId = useId();

  return (
    <span
      className={`${styles.wrap} ${styles[`phase_${phase}`]} ${active ? styles.active : ''}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className={styles.ring} />
      <svg viewBox="0 0 64 64" className={styles.svg}>
        <defs>
          <radialGradient id={gradientId} cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#4fe0b8" />
            <stop offset="100%" stopColor="var(--app-teal-strong)" />
          </radialGradient>
        </defs>
        <rect x="1" y="26" width="4" height="12" rx="2" className={styles.ear} />
        <rect x="59" y="26" width="4" height="12" rx="2" className={styles.ear} />
        <rect x="6" y="6" width="52" height="52" rx="20" fill={`url(#${gradientId})`} />
        <rect x="17" y="25" width="30" height="15" rx="7.5" className={styles.visor} />
        <rect x="23" y="29" width="7" height="7" rx="3.5" className={styles.eye} style={{ animationDelay: '0ms' }} />
        <rect x="34" y="29" width="7" height="7" rx="3.5" className={styles.eye} style={{ animationDelay: '260ms' }} />
      </svg>
    </span>
  );
}
