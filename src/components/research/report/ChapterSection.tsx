import { MarkdownLite } from '@/components/MarkdownLite';
import { ReportBlocks } from '@/components/research/blocks/ReportBlocks';
import { safeHref } from '@/lib/security/safeHref';
import type { ReportChapter } from '@/lib/research/report/chapters';
import styles from './report.module.css';

function Evidence({ chapter }: { readonly chapter: ReportChapter }) {
  if (chapter.searched.length === 0 && chapter.sources.length === 0) return null;
  const queries = chapter.searched.filter((s) => s.tool === 'web_search');
  return (
    <details className={styles.evidence} data-print-hide>
      <summary>
        Searched {queries.length} {queries.length === 1 ? 'time' : 'times'}, {chapter.sources.length} {chapter.sources.length === 1 ? 'source' : 'sources'}
      </summary>
      {queries.length > 0 && (
        <ul className={styles.queries}>
          {queries.map((q, i) => (
            <li key={`${q.input}-${i}`}>{q.input}</li>
          ))}
        </ul>
      )}
      {chapter.sources.length > 0 && (
        <ul className={styles.sources}>
          {chapter.sources.map((s) => (
            <li key={s.url}>
              <a href={safeHref(s.url)} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** One chapter: its figures, its text (or a placeholder while it is being written), and what it searched. */
export function ChapterSection({ chapter }: { readonly chapter: ReportChapter }) {
  return (
    <section id={`chapter-${chapter.id}`} className={styles.chapter} data-status={chapter.status} aria-busy={chapter.status === 'pending'}>
      <header className={styles.chapterHead}>
        <h2 className={styles.chapterTitle}>{chapter.title}</h2>
        {chapter.status === 'pending' && (
          <span className={styles.writing} role="status">
            Writing…
          </span>
        )}
      </header>
      {chapter.blocks.length > 0 && <ReportBlocks blocks={chapter.blocks} />}
      {chapter.prose && <MarkdownLite text={chapter.prose} className={styles.prose} />}
      {chapter.status === 'pending' && !chapter.prose && (
        <div className={styles.skeleton} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      )}
      {chapter.status === 'failed' && (
        <p className={styles.failed}>
          This chapter could not be written{chapter.note ? `: ${chapter.note}` : '.'}
          {chapter.blocks.length > 0 ? ' The figures above are still the stored data.' : ''}
        </p>
      )}
      <Evidence chapter={chapter} />
    </section>
  );
}
