'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { buildMoreSections, shouldDismissSheet } from './mobileNav';
import { isNavActive } from './navItems';
import { NAV_ICONS, ResearchIcon } from './NavIcons';
import styles from './MoreSheet.module.css';

interface MoreSheetProps {
  readonly open: boolean;
  readonly pathname: string;
  readonly advisorEnabled: boolean;
  readonly onClose: () => void;
}

/** Slide-up bottom sheet holding the routes that don't fit the 5-slot bar. Native <dialog>: focus trap, Esc, focus restore. */
export function MoreSheet({ open, pathname, advisorEnabled, onClose }: MoreSheetProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; startT: number; id: number } | null>(null);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startT: e.timeStamp, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.startY));
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const distance = e.clientY - d.startY;
    const velocity = distance / Math.max(1, e.timeStamp - d.startT);
    setDragY(0);
    if (shouldDismissSheet(distance, velocity)) onClose();
  };

  return (
    <dialog
      ref={dialog}
      className={styles.sheet}
      style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      aria-label="More navigation"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose(); // tap on the backdrop
      }}
    >
      <div
        className={styles.handleZone}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="presentation"
      >
        <span className={styles.handle} aria-hidden="true" />
      </div>

      <nav className={styles.content} aria-label="More">
        {buildMoreSections(advisorEnabled).map((section) => (
          <section key={section.title} aria-label={section.title}>
            <h2 className={styles.sectionTitle}>{section.title}</h2>
            <ul className={styles.grid}>
              {section.items.map((item) => {
                const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS] ?? ResearchIcon;
                const active = item.href === '/status' ? pathname === '/status' : isNavActive(pathname, item.href);
                return (
                  <li key={item.href}>
                    <Link href={item.href} className={`${styles.item} ${active ? styles.itemActive : ''}`} aria-current={active ? 'page' : undefined} onClick={onClose}>
                      <span className={styles.itemIcon}>
                        <Icon />
                      </span>
                      <span className={styles.itemLabel}>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    </dialog>
  );
}
