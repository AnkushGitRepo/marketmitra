// Geometry for the SIP chart: invested amount and portfolio value on one scale, plain SVG.

import type { SipPoint } from './sip';

export interface SipMark extends SipPoint {
  readonly x: number;
  readonly valueY: number;
  readonly investedY: number;
}

export interface SipChart {
  readonly marks: readonly SipMark[];
  readonly valuePath: string;
  readonly investedPath: string;
  /** The largest amount on either line: the top of the scale (the bottom is zero). */
  readonly max: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** `padLeft` (default `pad`) is a wider left margin for the axis label, so it sits beside the lines and never on them. */
export function buildSipChart(points: readonly SipPoint[], width: number, height: number, pad: number, padLeft: number = pad): SipChart | null {
  if (points.length < 2) return null;
  const max = Math.max(...points.flatMap((p) => [p.invested, p.value]));
  if (!(max > 0)) return null;
  const innerW = width - padLeft - pad;
  const innerH = height - pad * 2;
  const yOf = (amount: number): number => pad + (1 - amount / max) * innerH;

  const marks: SipMark[] = points.map((p, i) => ({
    ...p,
    x: padLeft + (i / (points.length - 1)) * innerW,
    valueY: yOf(p.value),
    investedY: yOf(p.invested),
  }));
  const path = (key: 'valueY' | 'investedY'): string =>
    marks.map((m, i) => `${i === 0 ? 'M' : 'L'}${round(m.x)},${round(m[key])}`).join(' ');
  return { marks, valuePath: path('valueY'), investedPath: path('investedY'), max };
}
