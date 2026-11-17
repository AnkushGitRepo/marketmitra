'use client';

import { BOARD_LABELS, type ScreenerBoard } from '@/lib/dashboard/screenerSchema';
import styles from './BoardTabs.module.css';

// The order people read them in: everything first, then each board.
const TAB_ORDER: readonly ScreenerBoard[] = ['all', 'mainboard', 'sme'];

interface BoardTabsProps {
  readonly value: ScreenerBoard;
  readonly onChange: (board: ScreenerBoard) => void;
  /** Companies per board, when known: shown next to each label. */
  readonly counts?: { readonly mainboard: number; readonly sme: number };
}

function countFor(board: ScreenerBoard, counts: BoardTabsProps['counts']): number | null {
  if (!counts) return null;
  return board === 'all' ? counts.mainboard + counts.sme : counts[board];
}

/** The listing-board choice (All / Main board / SME) as one visible control, not a dropdown inside the filters. */
export function BoardTabs({ value, onChange, counts }: BoardTabsProps) {
  return (
    <div className={styles.group} role="radiogroup" aria-label="Listing board">
      {TAB_ORDER.map((board) => {
        const count = countFor(board, counts);
        return (
          <button key={board} type="button" role="radio" aria-checked={value === board} className={styles.tab} onClick={() => onChange(board)}>
            {BOARD_LABELS[board]}
            {count !== null && count > 0 && <span className={styles.count}>{count.toLocaleString('en-IN')}</span>}
          </button>
        );
      })}
    </div>
  );
}
