'use client';

import type { DrawingTool } from '@/lib/chart/drawings';
import { ToolIcon } from './ToolIcons';
import styles from './ProChart.module.css';

interface ToolInfo {
  id: DrawingTool;
  label: string;
  /** One line on how to use it, shown in the tooltip. */
  hint: string;
}

const TOOLS: ToolInfo[] = [
  { id: 'cursor', label: 'Cursor', hint: 'Look around: drag to pan, scroll to zoom' },
  { id: 'trend', label: 'Trend line', hint: 'Click two points to join them' },
  { id: 'ray', label: 'Ray', hint: 'Click two points; the line runs on to the right' },
  { id: 'hline', label: 'Horizontal line', hint: 'Click a price to mark it across the chart' },
  { id: 'vline', label: 'Vertical line', hint: 'Click a bar to mark that time' },
  { id: 'rect', label: 'Rectangle', hint: 'Click two corners to box an area' },
  { id: 'fib', label: 'Fib retracement', hint: 'Click the swing start, then its end' },
  {
    id: 'long',
    label: 'Long position',
    hint: 'Click the entry, then the target; the stop is placed for you',
  },
  {
    id: 'short',
    label: 'Short position',
    hint: 'Click the entry, then the target below it; the stop is placed for you',
  },
  { id: 'measure', label: 'Measure', hint: 'Click two points for the move, percent and bars' },
  { id: 'text', label: 'Text note', hint: 'Click where it goes, type, press Enter' },
];

/** Name and hint beside a button, on hover and on keyboard focus. The button keeps its own accessible name, so this is decoration. */
function Tip({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className={styles.toolTip} aria-hidden="true">
      <span className={styles.toolTipLabel}>{label}</span>
      {hint && <span className={styles.toolTipHint}>{hint}</span>}
    </span>
  );
}

interface DrawingToolbarProps {
  tool: DrawingTool;
  onTool: (tool: DrawingTool) => void;
  hasDrawings: boolean;
  onClear: () => void;
}

export function DrawingToolbar({ tool, onTool, hasDrawings, onClear }: DrawingToolbarProps) {
  return (
    <div
      className={styles.tools}
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
    >
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={t.label}
          aria-pressed={tool === t.id}
          className={`${styles.toolBtn} ${tool === t.id ? styles.toolBtnActive : ''}`}
          onClick={() => onTool(t.id)}
        >
          <ToolIcon tool={t.id} />
          <Tip label={t.label} hint={t.hint} />
        </button>
      ))}
      <span className={styles.toolSpacer} />
      <button
        type="button"
        aria-label="Remove all drawings"
        className={styles.toolBtn}
        disabled={!hasDrawings}
        onClick={onClear}
      >
        <ToolIcon tool="trash" />
        <Tip
          label="Remove all drawings"
          hint={hasDrawings ? 'Clears every drawing on this timeframe' : 'Nothing drawn yet'}
        />
      </button>
    </div>
  );
}
