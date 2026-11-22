'use client';

import { useId, type ReactNode } from 'react';
import styles from './ChartMotion.module.css';

const safeId = (prefix: string, raw: string): string => `${prefix}-${raw.replace(/[^a-zA-Z0-9]/g, '')}`;

interface ChartRevealProps {
  readonly width: number;
  readonly height: number;
  /** Changes whenever the data drawn changes (mode, range, amount, period), which draws the content in again. Not hover. */
  readonly replayKey: string;
  readonly children: ReactNode;
}

/**
 * Draws its SVG content in from left to right (#304). A clip that grows is used instead of a stroke-dash offset: the lines use a
 * non-scaling stroke, whose dash lengths are in screen units, and the same reveal also carries the area fill along with the line.
 */
export function ChartReveal({ width, height, replayKey, children }: ChartRevealProps) {
  const id = safeId('reveal', useId());
  return (
    <>
      <defs>
        <clipPath id={id}>
          <rect key={replayKey} className={styles.reveal} x={0} y={0} width={width} height={height} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  );
}

interface ChartAreaProps {
  readonly d: string;
  readonly tone: 'up' | 'down';
}

/** A soft gradient under a line: 15% of the tone colour at the line, fading to nothing at the baseline. */
export function ChartArea({ d, tone }: ChartAreaProps) {
  const id = safeId('area', useId());
  if (d === '') return null;
  return (
    <>
      <defs>
        <linearGradient id={id} className={tone === 'up' ? styles.up : styles.down} x1="0" y1="0" x2="0" y2="1">
          <stop className={styles.top} offset="0" />
          <stop className={styles.bottom} offset="1" />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} stroke="none" />
    </>
  );
}
