'use client';

import Link from 'next/link';
import { groupCalls, stageOf, stageText, summaryText, toolCalls, type PartLike } from '@/lib/mitra-chat/toolActivity';
import { isCardToolPart } from '@/lib/ai/a2uiToolTypes';
import styles from './ToolActivity.module.css';

interface ToolActivityProps {
  readonly parts: readonly PartLike[];
  /** True while this reply is still being written. */
  readonly streaming: boolean;
  /** The "Show tool activity" setting: off hides the list of tools but not the line saying what Mitra is doing. */
  readonly showTools: boolean;
  /** Pages a navigation tool opened, by tool name, so the list can link to them. */
  readonly targets?: Readonly<Record<string, string>>;
}

/** One line saying what Mitra is doing, with a pulsing dot. Also used before the reply message exists. */
export function StageLine({ text }: { readonly text: string }) {
  return (
    <p className={styles.stage} role="status">
      <span className={styles.orb} aria-hidden="true" />
      <span className={styles.shimmer}>{text}</span>
    </p>
  );
}

/**
 * While Mitra works: what it is doing now, and each tool with a spinner that turns into a check. Once the reply is done: one
 * collapsed "Used N tools" line that opens to the full list. This replaces a row of grey chips, one per call (#338).
 */
export function ToolActivity({ parts, streaming, showTools, targets = {} }: ToolActivityProps) {
  const calls = toolCalls(parts, isCardToolPart);
  const groups = groupCalls(calls);

  if (streaming) {
    const stage = stageOf(parts, isCardToolPart);
    if (stage === 'writing' && groups.every((g) => !g.running)) {
      // The text itself is the signal now; keep the finished tools visible as a one-line tally.
      return showTools && calls.length > 0 ? <p className={styles.tally}>✓ {summaryText(calls)}</p> : null;
    }
    return (
      <div className={styles.live}>
        <StageLine text={stageText(stage, parts, isCardToolPart)} />
        {showTools && groups.length > 0 && (
          <ul className={styles.list}>
            {groups.map((g) => (
              <li key={g.name} className={styles.row}>
                {g.running ? <span className={styles.spinner} aria-label="running" /> : <span className={g.failed ? styles.failed : styles.done} aria-label={g.failed ? 'failed' : 'done'}>{g.failed ? '!' : '✓'}</span>}
                <span>{g.label}</span>
                {g.count > 1 && <span className={styles.count}>×{g.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  if (!showTools || calls.length === 0) return null;
  return (
    <details className={styles.summary}>
      <summary>
        <span className={styles.done} aria-hidden="true">✓</span> {summaryText(calls)}
      </summary>
      <ul className={styles.list}>
        {groups.map((g) => (
          <li key={g.name} className={styles.row}>
            <span className={g.failed ? styles.failed : styles.done} aria-hidden="true">{g.failed ? '!' : '✓'}</span>
            <span>{g.label}</span>
            {g.count > 1 && <span className={styles.count}>×{g.count}</span>}
            {targets[g.name] && (
              <Link href={targets[g.name]} className={styles.open}>
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
