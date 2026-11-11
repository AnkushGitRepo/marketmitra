'use client';

import { useEffect, useRef } from 'react';
import { AnalystChat } from './AnalystChat';
import { DossierReader } from './DossierReader';
import { MorningBrief } from './MorningBrief';
import styles from './AnalystDrawer.module.css';

/** What the drawer shows: one analyst's dossier, the morning brief, or a chat with an analyst (`symbol`) or with the Root Agent (`symbol: null`). */
export type DrawerPanel = { readonly kind: 'dossier'; readonly symbol: string } | { readonly kind: 'chat'; readonly symbol: string | null } | { readonly kind: 'brief' };

interface AnalystDrawerProps {
  readonly panel: DrawerPanel | null;
  readonly onChange: (panel: DrawerPanel) => void;
  readonly onClose: () => void;
}

/** A right-hand, full-height slide-over. A native modal <dialog>, so focus is trapped and Escape closes it. */
export function AnalystDrawer({ panel, onChange, onClose }: AnalystDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (panel && !d.open) d.showModal();
    if (!panel && d.open) d.close();
  }, [panel]);

  const title = !panel ? '' : panel.kind === 'brief' ? 'Morning brief' : panel.kind === 'dossier' ? `${panel.symbol} · living dossier` : panel.symbol ? `Chat with the ${panel.symbol} analyst` : 'Chat with Mitra Portfolio CIO';

  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-label={panel?.kind === 'chat' ? 'Analyst chat' : panel?.kind === 'brief' ? 'Morning brief' : 'Analyst dossier'}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {panel && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 className={styles.title}>{title}</h2>
            <div className={styles.headActions}>
              {panel.kind === 'dossier' && (
                <button type="button" className={styles.action} onClick={() => onChange({ kind: 'chat', symbol: panel.symbol })}>
                  Chat with analyst
                </button>
              )}
              {panel.kind === 'chat' && panel.symbol && (
                <button type="button" className={styles.action} onClick={() => onChange({ kind: 'dossier', symbol: panel.symbol as string })}>
                  View dossier
                </button>
              )}
              <button type="button" className={styles.close} onClick={onClose} aria-label="Close panel">
                Close
              </button>
            </div>
          </div>
          <div className={panel.kind === 'chat' ? styles.bodyChat : styles.body}>
            {panel.kind === 'dossier' && <DossierReader key={panel.symbol} symbol={panel.symbol} tabbed />}
            {panel.kind === 'chat' && <AnalystChat key={panel.symbol ?? 'root'} symbol={panel.symbol} />}
            {panel.kind === 'brief' && <MorningBrief />}
          </div>
        </div>
      )}
    </dialog>
  );
}
