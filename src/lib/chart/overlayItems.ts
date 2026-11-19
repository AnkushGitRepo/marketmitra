// The parts of an Auto-Chart overlay as separately removable items (#245): each level, each trendline and the trade setup. The
// ids are stable (a label or the trendline's end times, never a position), so removing one does not renumber the rest. Pure.

import type { ChartOverlay } from './aiOverlay';

export interface OverlayItem {
  id: string;
  name: string;
  detail: string;
}

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const trendId = (t: ChartOverlay['trendlines'][number]) => `trend:${t.a.time}|${t.b.time}`;

export function overlayItems(overlay: ChartOverlay): OverlayItem[] {
  const items: OverlayItem[] = overlay.levels.map((l) => ({
    id: `level:${l.label}`,
    name: `${l.kind === 'support' ? 'Support' : 'Resistance'} ${l.label}`,
    detail: rupees(l.price),
  }));
  for (const t of overlay.trendlines) {
    items.push({
      id: trendId(t),
      name: 'Trendline',
      detail: `${rupees(t.a.price)} → ${rupees(t.b.price)}`,
    });
  }
  if (overlay.setup) {
    const s = overlay.setup;
    items.push({
      id: 'setup',
      name: s.direction === 'long' ? 'Long setup' : 'Short setup',
      detail: `Entry ${rupees(s.entry)} · Stop ${rupees(s.stop)} · Target ${rupees(s.target)}`,
    });
  }
  return items;
}

/** A copy of the overlay without the item. Removing the setup also drops its explanation. An unknown id changes nothing. */
export function removeOverlayItem(overlay: ChartOverlay, id: string): ChartOverlay {
  if (id === 'setup') {
    return Object.fromEntries(
      Object.entries(overlay).filter(([key]) => key !== 'setup' && key !== 'setupNote'),
    ) as unknown as ChartOverlay;
  }
  return {
    ...overlay,
    levels: overlay.levels.filter((l) => `level:${l.label}` !== id),
    trendlines: overlay.trendlines.filter((t) => trendId(t) !== id),
  };
}

/** Nothing left to draw. The indicators it recommended are changes to the user's indicator list, not drawings, so they do not count. */
export function isOverlayEmpty(overlay: ChartOverlay): boolean {
  return overlay.levels.length === 0 && overlay.trendlines.length === 0 && !overlay.setup;
}
