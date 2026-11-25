// The chapter jump bar (#361): which links it shows and which one is current. Pure; the page supplies the measurements.

import { CHAPTERS, type ChapterId } from './chapters';

export interface NavItem {
  readonly label: string;
  /** The chapter the link scrolls to (the first one when several share a label). */
  readonly target: ChapterId;
  /** Every chapter this link covers; it is current while any of them is. */
  readonly ids: readonly ChapterId[];
}

/** One link per label, in reading order, for the chapters that are on the page (the regulatory and legal chapters share one). */
export function navItems(present: readonly ChapterId[]): NavItem[] {
  const items: { label: string; ids: ChapterId[] }[] = [];
  for (const chapter of CHAPTERS) {
    if (!present.includes(chapter.id)) continue;
    const existing = items.find((i) => i.label === chapter.nav);
    if (existing) existing.ids.push(chapter.id);
    else items.push({ label: chapter.nav, ids: [chapter.id] });
  }
  return items.map((i) => ({ label: i.label, target: i.ids[0], ids: i.ids }));
}

export interface ChapterPosition {
  readonly id: ChapterId;
  /** Distance of the chapter's top edge from the top of the viewport, in pixels (negative once scrolled past). */
  readonly top: number;
}

/**
 * The chapter being read: the last one whose top has reached the line just under the sticky bars, or the first when none has yet.
 * Positions must be in reading order.
 */
export function chapterAtLine(positions: readonly ChapterPosition[], line: number): ChapterId | null {
  if (positions.length === 0) return null;
  let current = positions[0].id;
  for (const p of positions) {
    if (p.top <= line) current = p.id;
    else break;
  }
  return current;
}

/** The link to highlight for the chapter being read. */
export const activeNav = (items: readonly NavItem[], reading: ChapterId | null): string | null =>
  reading === null ? null : (items.find((i) => i.ids.includes(reading))?.label ?? null);
