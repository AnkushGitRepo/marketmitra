export interface RangeSeries {
  v: number[];
  l: string[];
}

/** One OHLC bar. `date` is the first trade date the bar covers (ISO),
 * `label` the short axis label derived from it. */
export interface CandlePoint {
  open: number;
  high: number;
  low: number;
  close: number;
  date: string;
  label: string;
}

export interface ChartPoint {
  x: number;
  y: number;
  v: number;
  label: string;
}

export interface BuiltChart {
  linePath: string;
  areaPath: string;
  pts: ChartPoint[];
}

/** Builds an SVG line+area path (720-wide viewBox) from a value series. */
export function buildChart(src: RangeSeries, height: number): BuiltChart {
  const vals = src.v;
  const width = 720;
  const top = 16;
  const bottom = height - 30;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const x = (i: number) => (vals.length === 1 ? width / 2 : (i * width) / (vals.length - 1));
  const y = (v: number) => top + (1 - (v - min) / span) * (bottom - top);

  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const areaPath = `${line} L${width} ${height} L0 ${height} Z`;
  const pts = vals.map((v, i) => ({ x: x(i), y: y(v), v, label: src.l[i] ?? '' }));

  return { linePath: line, areaPath, pts };
}

/** Builds a compact 120x34 sparkline path for index/mover cards. */
export function buildSparkline(vals: number[]): string {
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return vals
    .map((v, i) => {
      const x = (i * 120) / (vals.length - 1);
      const y = 30 - ((v - min) / span) * 26;
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}
