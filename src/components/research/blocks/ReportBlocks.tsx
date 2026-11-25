import type { ResearchBlock } from '@/lib/research/blocks';
import { BarChart } from './BarChart';
import { DataTable } from './DataTable';
import { DonutChart } from './DonutChart';
import { KpiGrid } from './KpiGrid';
import { ThesisBento } from './ThesisBento';
import styles from './blocks.module.css';

function BlockView({ block }: { readonly block: ResearchBlock }) {
  switch (block.type) {
    case 'kpi_grid':
      return <KpiGrid block={block} />;
    case 'bar_chart':
      return <BarChart block={block} />;
    case 'donut_chart':
      return <DonutChart block={block} />;
    case 'data_table':
      return <DataTable block={block} />;
    case 'thesis_bento':
      return <ThesisBento block={block} />;
  }
}

/** The blocks in order. Charts that sit next to each other share a row. */
export function ReportBlocks({ blocks }: { readonly blocks: readonly ResearchBlock[] }) {
  const items: { key: string; blocks: ResearchBlock[] }[] = [];
  for (const [i, block] of blocks.entries()) {
    const last = items.at(-1);
    const isChart = block.type === 'bar_chart' || block.type === 'donut_chart';
    const lastIsChart = last?.blocks.every((b) => b.type === 'bar_chart' || b.type === 'donut_chart');
    if (isChart && last && lastIsChart) last.blocks.push(block);
    else items.push({ key: `${block.type}-${i}`, blocks: [block] });
  }
  return (
    <div className={styles.report}>
      {items.map((item) => (
        <div key={item.key} className={item.blocks.length > 1 ? styles.chartRow : undefined}>
          {item.blocks.map((b, i) => (
            <BlockView key={`${b.type}-${i}`} block={b} />
          ))}
        </div>
      ))}
    </div>
  );
}
