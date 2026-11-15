import { describe, expect, it } from 'vitest';
import { HOLDINGS } from './fixtures';
import { trackerRows, type AnalystView } from './tracker';

const crit = (breached: boolean, enabled = true) => ({ id: 'roce', metric: 'roce', op: 'below', threshold: 10, baseline: 20, why: '', source: 'default', enabled, breached }) as const;

describe('trackerRows', () => {
  const analysts: AnalystView[] = [
    { symbol: 'AAA', status: 'active', hasDossier: true, criteria: [crit(false)] },
    { symbol: 'BBB', status: 'active', hasDossier: true, criteria: [crit(true)] },
    { symbol: 'CCC', status: 'initializing', hasDossier: false, criteria: null },
  ];
  const rows = trackerRows(HOLDINGS, analysts);

  it('builds one row per holding from average price and LTP', () => {
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ symbol: 'AAA', avgPrice: 50, ltp: 100, returnPct: 100 });
  });

  it('maps analyst state to a thesis status', () => {
    expect(rows.map((r) => r.thesis)).toEqual(['intact', 'review', 'pending', 'none']);
  });

  it('ignores switched-off criteria', () => {
    const r = trackerRows([HOLDINGS[1]], [{ symbol: 'BBB', status: 'active', hasDossier: true, criteria: [crit(true, false)] }]);
    expect(r[0].thesis).toBe('intact');
  });

  it('has a null return for unpriced holdings', () => {
    expect(trackerRows([{ ...HOLDINGS[0], ltp: null }], [])[0].returnPct).toBeNull();
  });
});
