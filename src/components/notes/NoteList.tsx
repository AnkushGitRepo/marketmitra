import { noteCategory, notePreview, noteTickers, timeAgo, type VaultNote } from '@/lib/notes/vault';
import styles from './NotesVault.module.css';

interface NoteListProps {
  readonly notes: readonly VaultNote[];
  readonly selectedId: string | null;
  readonly now: Date;
  readonly onSelect: (id: string) => void;
  /** Asks to delete a note (the page confirms first). */
  readonly onDelete: (id: string) => void;
}

const MAX_CHIPS = 2;

export function NoteList({ notes, selectedId, now, onSelect, onDelete }: NoteListProps) {
  return (
    <ul className={styles.list}>
      {notes.map((n) => {
        const tickers = noteTickers(n);
        return (
          <li key={n.id} className={styles.itemRow}>
            <button type="button" className={styles.item} data-selected={n.id === selectedId} aria-current={n.id === selectedId} onClick={() => onSelect(n.id)}>
              <span className={styles.itemTitle}>{n.title}</span>
              <span className={styles.itemPreview}>{notePreview(n.body)}</span>
              <span className={styles.itemMeta}>
                <span className={styles.badge} data-kind={noteCategory(n)}>
                  {n.source === 'research' ? 'Saved' : 'Note'}
                </span>
                {tickers.slice(0, MAX_CHIPS).map((t) => (
                  <span key={t} className={styles.ticker}>
                    {t}
                  </span>
                ))}
                {tickers.length > MAX_CHIPS && <span className={styles.ticker}>+{tickers.length - MAX_CHIPS}</span>}
                <span className={styles.time}>{timeAgo(n.updatedAt, now)}</span>
              </span>
            </button>
            <button type="button" className={styles.itemDelete} aria-label={`Delete ${n.title}`} title="Delete note" onClick={() => onDelete(n.id)}>
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8.5h5l.5-8.5M7 7v4M9 7v4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
