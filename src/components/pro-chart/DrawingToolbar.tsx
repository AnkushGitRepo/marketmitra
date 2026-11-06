'use client';

import type { DrawingTool } from '@/lib/chart/drawings';
import { ToolIcon } from './ToolIcons';
import styles from './ProChart.module.css';

const TOOLS: { id: DrawingTool; label: string }[] = [
  { id: 'cursor', label: 'Cursor' },
  { id: 'trend', label: 'Trend line' },
  { id: 'hline', label: 'Horizontal line' },
  { id: 'fib', label: 'Fib retracement' },
  { id: 'measure', label: 'Measure' },
  { id: 'text', label: 'Text note' },
];

interface DrawingToolbarProps {
  tool: DrawingTool;
  onTool: (tool: DrawingTool) => void;
  hasDrawings: boolean;
  onClear: () => void;
}

export function DrawingToolbar({ tool, onTool, hasDrawings, onClear }: DrawingToolbarProps) {
  return (
    <div className={styles.tools} role="toolbar" aria-label="Drawing tools" aria-orientation="vertical">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-label={t.label}
          aria-pressed={tool === t.id}
          className={`${styles.toolBtn} ${tool === t.id ? styles.toolBtnActive : ''}`}
          onClick={() => onTool(t.id)}
        >
          <ToolIcon tool={t.id} />
        </button>
      ))}
      <span className={styles.toolSpacer} />
      <button
        type="button"
        title="Remove all drawings"
        aria-label="Remove all drawings"
        className={styles.toolBtn}
        disabled={!hasDrawings}
        onClick={onClear}
      >
        <ToolIcon tool="trash" />
      </button>
    </div>
  );
}
