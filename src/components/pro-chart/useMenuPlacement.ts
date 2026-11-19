'use client';

import { useLayoutEffect, type RefObject } from 'react';

/** Keep clear of the edge by this much, in px. */
const EDGE_PX = 8;

/** Gap between a button and its menu, in px (the same as `.menu`'s `top` in the CSS). */
const GAP_PX = 6;
const CSS_MAX_HEIGHT_PX = 560;

function placeMenu(root: HTMLElement): void {
  const menu = root.querySelector<HTMLElement>('[role="menu"]');
  if (!menu) return;
  menu.style.left = '';
  menu.style.top = '';
  menu.style.bottom = '';
  menu.style.maxHeight = '';
  const wrap = root.getBoundingClientRect();
  const own = menu.getBoundingClientRect();

  const box = root.closest('[data-menu-bounds]')?.getBoundingClientRect();
  const minX = Math.max(0, box?.left ?? 0) + EDGE_PX;
  const maxX = Math.min(window.innerWidth, box?.right ?? window.innerWidth) - EDGE_PX;
  let left = 0;
  if (wrap.left + own.width > maxX) left = maxX - own.width - wrap.left;
  if (wrap.left + left < minX) left = minX - wrap.left;
  if (left !== 0) menu.style.left = `${left}px`;

  const below = window.innerHeight - wrap.bottom - GAP_PX - EDGE_PX;
  const above = wrap.top - GAP_PX - EDGE_PX;
  if (own.height <= below) return;
  if (above > below) {
    menu.style.top = 'auto';
    menu.style.bottom = `calc(100% + ${GAP_PX}px)`;
    menu.style.maxHeight = `${Math.min(CSS_MAX_HEIGHT_PX, above)}px`;
  } else {
    menu.style.maxHeight = `${Math.max(120, below)}px`;
  }
}

/**
 * Keeps a toolbar dropdown on screen (#262). The menu opens under its button, left-aligned. Sideways it is moved just far enough to sit
 * inside the chart workspace and the window; vertically, when it would run past the bottom of the window it opens above the button if
 * there is more room there, and is shortened (it scrolls inside) to whatever room it has. Done on the DOM before paint, so it never flashes
 * in the wrong place, and again when the window is resized. The workspace marks itself with `data-menu-bounds`.
 */
export function useMenuPlacement(open: boolean, rootRef: RefObject<HTMLElement | null>): void {
  // After every render while open: choosing a run, applying a setup or turning Auto-Chart on changes the widths of the buttons
  // beside this one, which moves the menu's anchor.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (open && root) placeMenu(root);
  });

  // And when the window or the chart workspace changes size without this component rendering.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!open || !root) return;
    const place = () => placeMenu(root);
    window.addEventListener('resize', place);
    const bounds = root.closest('[data-menu-bounds]');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    if (bounds) observer?.observe(bounds);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [open, rootRef]);
}
