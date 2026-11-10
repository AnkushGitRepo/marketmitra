export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

export type PageItem = number | 'gap';

/** Page numbers (0-based) to render: first, last, and a window around the
 * current page, with `'gap'` where pages are skipped. e.g. 1 … 4 5 [6] 7 8 … 20 */
export function pageWindow(current: number, pageCount: number, radius = 2): PageItem[] {
  if (pageCount <= 1) return pageCount === 1 ? [0] : [];
  const keep = new Set<number>([0, pageCount - 1]);
  for (let p = current - radius; p <= current + radius; p++) {
    if (p >= 0 && p < pageCount) keep.add(p);
  }
  const sorted = [...keep].sort((a, b) => a - b);
  const items: PageItem[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) items.push('gap');
    items.push(page);
  });
  return items;
}

export function pageCountFor(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
