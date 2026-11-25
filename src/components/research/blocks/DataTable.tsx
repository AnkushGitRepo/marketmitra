'use client';

import { useMemo, useState } from 'react';
import type { DataTableBlock } from '@/lib/research/blocks';
import { bestRows, sortRows } from '@/lib/research/chartMath';
import { formatCell } from '@/lib/research/formatters';
import styles from './blocks.module.css';

interface Sort {
  readonly key: string;
  readonly direction: 'asc' | 'desc';
}

/** A table whose headers sort it; the best figure in each column that has a "best" is marked green. */
export function DataTable({ block }: { readonly block: DataTableBlock }) {
  const [sort, setSort] = useState<Sort | null>(null);
  const rows = useMemo(() => (sort ? sortRows(block.rows, sort.key, sort.direction) : block.rows), [block.rows, sort]);
  const best = useMemo(
    () => new Map(block.columns.filter((c) => c.best).map((c) => [c.key, bestRows(rows.map((r) => r[c.key] ?? null), c.best!)])),
    [block.columns, rows]
  );

  const toggle = (key: string) =>
    setSort((cur) => (cur?.key === key ? { key, direction: cur.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: key === block.columns[0]?.key ? 'asc' : 'desc' }));

  return (
    <div className={styles.tableBlock}>
      <p className={styles.chartTitle}>{block.title}</p>
      {block.note && <p className={styles.tableNote}>{block.note}</p>}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              {block.columns.map((c) => (
                <th key={c.key} data-align={c.format === 'text' ? 'left' : 'right'} aria-sort={sort?.key === c.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className={styles.sortButton} onClick={() => toggle(c.key)}>
                    {c.label}
                    <span aria-hidden="true">{sort?.key === c.key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {block.columns.map((c) => (
                  <td key={c.key} data-align={c.format === 'text' ? 'left' : 'right'} data-best={best.get(c.key)?.has(ri) ?? false}>
                    {formatCell(row[c.key] ?? null, c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
