'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ChapterId } from '@/lib/research/report/chapters';
import { activeNav, chapterAtLine, navItems } from '@/lib/research/report/nav';
import styles from './jumpBar.module.css';

/** Pixels from the top of the viewport that count as "the chapter being read": below the app header and this bar. */
const READING_LINE = 150;

interface ChapterJumpBarProps {
  /** The chapters on the page now, in any order. */
  readonly present: readonly ChapterId[];
}

const anchor = (id: ChapterId): HTMLElement | null => document.getElementById(`chapter-${id}`);

/** A sticky bar of links to the report's chapters, highlighting the one being read. */
export function ChapterJumpBar({ present }: ChapterJumpBarProps) {
  // Keyed on the content, not the array: the parent builds a new array on every render.
  const key = present.join(',');
  const items = useMemo(() => navItems(key ? (key.split(',') as ChapterId[]) : []), [key]);
  const [reading, setReading] = useState<ChapterId | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const positions = items.flatMap((i) => i.ids).flatMap((id) => {
        const el = anchor(id);
        return el ? [{ id, top: el.getBoundingClientRect().top }] : [];
      });
      setReading(chapterAtLine(positions, READING_LINE));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items]);

  if (items.length < 2) return null;
  const current = activeNav(items, reading);

  const jump = (event: React.MouseEvent, id: ChapterId) => {
    const el = anchor(id);
    if (!el) return;
    event.preventDefault();
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
    // Move focus to the chapter so a keyboard or screen-reader user lands where they jumped.
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };

  return (
    <nav className={styles.bar} aria-label="Jump to a chapter" data-print-hide>
      <ol>
        {items.map((item) => (
          <li key={item.label}>
            <a href={`#chapter-${item.target}`} aria-current={current === item.label ? 'true' : undefined} onClick={(e) => jump(e, item.target)}>
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
