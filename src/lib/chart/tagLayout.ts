/**
 * Vertical positions for badges that sit beside price lines (#240). Each badge wants to be at its line's y; when two would overlap they
 * are pushed apart by at least `gap`, keeping their order, then the whole group is kept inside `[min, max]`. Returns the positions in
 * the order given. Pure.
 */
export function spreadTags(ys: readonly number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y || a.i - b.i);
  const placed: number[] = [];
  order.forEach(({ y }, k) => {
    placed.push(k === 0 ? Math.max(min, Math.min(max, y)) : Math.max(y, placed[k - 1] + gap));
  });
  // Pushing down can run past the bottom edge: pull from the bottom up so the group fits.
  for (let k = placed.length - 1; k >= 0; k--) {
    const limit = k === placed.length - 1 ? max : placed[k + 1] - gap;
    if (placed[k] > limit) placed[k] = limit;
  }
  const out = new Array<number>(ys.length);
  order.forEach(({ i }, k) => {
    out[i] = placed[k];
  });
  return out;
}
