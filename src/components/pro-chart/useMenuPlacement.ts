'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Keep clear of the edge by this much, in px. */
const EDGE_PX = 8;

/**
 * Keeps a toolbar dropdown inside the chart workspace (#262). The menu opens under its button, left-aligned; when that would run past
 * the workspace's right edge (a button near the end of the toolbar) or its left edge, it is moved just far enough to fit. Done on the
 * DOM before paint, so it never flashes in the wrong place. The workspace marks itself with `data-menu-bounds`; the viewport is the
 * fallback.
 */
export function useMenuPlacement(open: boolean, rootRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const place = () => {
      const menu = root.querySelector<HTMLElement>('[role="menu"]');
      if (!menu) return;
      menu.style.left = '';
      const wrap = root.getBoundingClientRect();
      const own = menu.getBoundingClientRect();
      const box = root.closest('[data-menu-bounds]')?.getBoundingClientRect();
      const minX = (box?.left ?? 0) + EDGE_PX;
      const maxX = (box?.right ?? window.innerWidth) - EDGE_PX;
      let left = 0;
      if (wrap.left + own.width > maxX) left = maxX - own.width - wrap.left;
      if (wrap.left + left < minX) left = minX - wrap.left;
      if (left !== 0) menu.style.left = `${left}px`;
    };
    place();
    // The chart can be resized while a menu is open (window, sidebar, full screen).
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, rootRef]);
}
