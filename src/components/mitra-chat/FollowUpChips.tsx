import styles from './FollowUpChips.module.css';

interface FollowUpChipsProps {
  readonly suggestions: readonly string[];
  /** Sends the chosen text as the user's next message. */
  readonly onPick: (text: string) => void;
}

/** Two or three things the user might ask next; one click sends it. */
export function FollowUpChips({ suggestions, onPick }: FollowUpChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className={styles.chips} role="group" aria-label="Suggested follow-up questions">
      {suggestions.map((s) => (
        <button key={s} type="button" className={styles.chip} onClick={() => onPick(s)}>
          {s}
        </button>
      ))}
    </div>
  );
}
