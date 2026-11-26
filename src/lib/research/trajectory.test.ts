import { describe, expect, it } from 'vitest';
import type { TrajectoryChartBlock } from './blocks';
import { axisTicks, trajectoryGeometry } from './trajectory';

const box = { width: 100, height: 50, pad: { top: 0, right: 0, bottom: 0, left: 0 } };
const block: Pick<TrajectoryChartBlock, 'labels' | 'projectedFrom'> = { labels: ['FY24', 'FY25', 'FY26', 'FY27E'], projectedFrom: 3 };

describe('axisTicks', () => {
  it('starts at zero for amounts and covers the largest value', () => {
    const t = axisTicks([120, 480], true);
    expect(t[0]).toBe(0);
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(480);
  });
  it('can go below zero for a loss, and stays snug for an index', () => {
    expect(axisTicks([-40, 100], true)[0]).toBeLessThanOrEqual(-40);
    expect(axisTicks([95, 140], false)[0]).toBeGreaterThan(50);
  });
});

describe('trajectoryGeometry', () => {
  const view = { key: 'sales', label: 'Revenue', unit: '₹ Cr', series: [{ name: 'A', values: [10, 20, 30, 40] }, { name: 'B', values: [5, null, 15, 18] }] };
  const g = trajectoryGeometry(block, view, box);

  it('draws actual years solid and joins the dashed projection to the last actual point', () => {
    expect(g.lines[0].actual).toHaveLength(1);
    expect(g.lines[0].projected).toHaveLength(1);
    const x = g.xFor(2);
    expect(g.lines[0].projected[0].startsWith(`M${x},`)).toBe(true);
  });
  it('breaks a line where a year has no figure', () => {
    expect(g.lines[1].actual).toEqual([]); // 5, gap, 15: two runs of one point each draw nothing
    expect(g.lines[1].points[1]).toBeNull();
  });
  it('puts the divider between the last actual and the first projected year', () => {
    expect(g.dividerX).toBeCloseTo((g.xFor(2) + g.xFor(3)) / 2);
  });
  it('has no divider or dashed line when nothing is projected', () => {
    const none = trajectoryGeometry({ labels: block.labels, projectedFrom: null }, view, box);
    expect(none.dividerX).toBeNull();
    expect(none.lines[0].projected).toEqual([]);
    expect(none.lines[0].actual).toHaveLength(1);
  });
  it('puts a bigger value higher up', () => {
    expect(g.yFor(40)).toBeLessThan(g.yFor(10));
  });
});
