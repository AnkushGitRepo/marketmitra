import { noteCategory, notePreview, noteTickers, timeAgo, type VaultNote } from '@/lib/notes/vault';
import styles from './NotesVault.module.css';

interface NoteListProps {
  readonly notes: readonly VaultNote[];
  readonly selectedId: string | null;
  readonly now: Date;
  readonly onSelect: (id: string) => void;
}

const MAX_CHIPS = 3;

export function NoteList({ notes, selectedId, now, onSelect }: NoteListProps) {
  return (
    <ul className={styles.list}>
      {notes.map((n) => {
        const tickers = noteTickers(n);
        return (
          <li key={n.id}>
            <button type="button" className={styles.item} data-selected={n.id === selectedId} aria-current={n.id === selectedId} onClick={() => onSelect(n.id)}>
              <span className={styles.itemTitle}>{n.title}</span>
              <span className={styles.itemPreview}>{notePreview(n.body)}</span>
              <span className={styles.itemMeta}>
                <span className={styles.badge} data-kind={noteCategory(n)}>
                  {n.source === 'research' ? 'Saved from Research' : 'Manual note'}
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
          </li>
        );
      })}
    </ul>
  );
}
