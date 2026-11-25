import { CHAPTERS } from '@/lib/research/report/chapters';
import { reportProgress, type ReportState } from '@/lib/research/report/stream';
import { ChapterJumpBar } from './ChapterJumpBar';
import { ChapterSection } from './ChapterSection';
import styles from './report.module.css';

interface CompanyReportViewProps {
  readonly state: ReportState;
  readonly running: boolean;
}

/** The streamed report: a heading with progress, then each chapter as soon as it has anything to show. */
export function CompanyReportView({ state, running }: CompanyReportViewProps) {
  const { finished, total } = reportProgress(state);
  const shown = CHAPTERS.map((c) => state.chapters[c.id]).filter((c): c is NonNullable<typeof c> => c !== undefined);
  return (
    <div className={styles.report}>
      {state.name && (
        <header className={styles.reportHead}>
          <h2 className={styles.company}>
            {state.name} <span className={styles.symbol}>{state.symbol}</span>
          </h2>
          {running && total > 0 && (
            <p className={styles.progress} role="status" aria-live="polite">
              Chapter {Math.min(finished + 1, total)} of {total}: the figures are in, the text is being written ({finished} finished)
            </p>
          )}
        </header>
      )}
      <ChapterJumpBar present={shown.map((c) => c.id)} />
      {shown.map((chapter) => (
        <ChapterSection key={chapter.id} chapter={chapter} />
      ))}
    </div>
  );
}
