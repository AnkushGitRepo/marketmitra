'use client';

import { useEffect, useRef } from 'react';
import { GO_TO_SHORTCUTS } from '@/lib/shortcuts/shortcuts';
import styles from './ShortcutsDialog.module.css';

interface ShortcutsDialogProps {
  readonly open: boolean;
  readonly isMac: boolean;
  readonly onClose: () => void;
}

interface Row {
  readonly keys: readonly string[];
  readonly label: string;
}

function Keys({ keys }: { keys: readonly string[] }) {
  return (
    <span className={styles.keys}>
      {keys.map((k, i) => (
        <span key={`${k}-${i}`} className={styles.keyGroup}>
          {i > 0 && <span className={styles.then}>then</span>}
          <kbd className={styles.kbd}>{k}</kbd>
        </span>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ open, isMac, onClose }: ShortcutsDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // Native <dialog> gives us the focus trap, Esc handling and focus restoration.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const search: Row = { keys: [isMac ? '⌘ K' : 'Ctrl K'], label: 'Search stocks and indices' };
  const go: readonly Row[] = GO_TO_SHORTCUTS.map((s) => ({ keys: ['G', s.key.toUpperCase()], label: `Go to ${s.label}` }));
  const help: Row = { keys: ['?'], label: 'Show this reference' };

  const renderRows = (rows: readonly Row[]) =>
    rows.map((row) => (
      <li key={row.label} className={styles.row}>
        <span>{row.label}</span>
        <Keys keys={row.keys} />
      </li>
    ));

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className={styles.header}>
        <h2 id="shortcuts-title" className={styles.title}>
          Keyboard shortcuts
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <p className={styles.sectionLabel}>Search</p>
      <ul className={styles.list}>{renderRows([search])}</ul>
      <p className={styles.sectionLabel}>Navigation</p>
      <ul className={styles.list}>{renderRows(go)}</ul>
      <p className={styles.sectionLabel}>Help</p>
      <ul className={styles.list}>{renderRows([help])}</ul>
    </dialog>
  );
}
