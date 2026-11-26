import type { ResearchBlock } from './blocks';
import { formatCell, formatNumber, formatPercent } from './formatters';

const cell = (text: string): string => text.replace(/\|/g, '/').replace(/\s+/g, ' ');
const pipeRow = (cells: readonly string[]): string => `| ${cells.map(cell).join(' | ')} |`;
const pipeTable = (header: readonly string[], rows: readonly (readonly string[])[]): string =>
  [pipeRow(header), pipeRow(header.map(() => '---')), ...rows.map(pipeRow)].join('\n');

function blockMarkdown(block: ResearchBlock): string | null {
  switch (block.type) {
    case 'kpi_grid':
      return block.items.map((i) => `- **${i.label}:** ${i.value}${i.note ? ` (${i.note})` : ''}`).join('\n');
    case 'data_table':
      return [
        `### ${block.title}`,
        ...(block.note ? [`*${block.note}*`] : []),
        pipeTable(
          block.columns.map((c) => c.label),
          block.rows.map((r) => block.columns.map((c) => formatCell(r[c.key] ?? null, c.format)))
        ),
      ].join('\n\n');
    case 'bar_chart':
      return [
        `### ${block.title} (${block.unit})`,
        pipeTable(
          ['', ...block.series.map((s) => s.name)],
          block.categories.map((cat, i) => [cat, ...block.series.map((s) => (s.values[i] == null ? '—' : formatNumber(s.values[i], Number.isInteger(s.values[i]) ? 0 : 1)))])
        ),
      ].join('\n\n');
    case 'financial_chart':
      return [
        `### ${block.title} (${block.unit})`,
        pipeTable(
          ['Period', 'Sales', 'Operating profit', 'OPM %', 'Sales growth'],
          block.periods.map((p) => [p.label, formatNumber(p.sales, 0), formatNumber(p.operatingProfit, 0), formatPercent(p.opm), formatPercent(p.salesGrowth)])
        ),
      ].join('\n\n');
    case 'trajectory_chart':
      return [
        ...(block.note ? [`*${block.note}*`] : []),
        ...block.views.map((v) =>
          [`### ${block.title}: ${v.label} (${v.unit})`, pipeTable(['', ...block.labels], v.series.map((s) => [s.name, ...s.values.map((x) => (x === null ? '—' : formatNumber(x, Number.isInteger(x) ? 0 : 1)))]))].join('\n\n')
        ),
      ].join('\n\n');
    case 'donut_chart': {
      const total = block.slices.reduce((a, s) => a + s.value, 0);
      return [`### ${block.title}`, block.slices.map((s) => `- ${s.label}: ${formatNumber(total === 0 ? 0 : (s.value / total) * 100)}%`).join('\n')].join('\n\n');
    }
    case 'card_grid':
      return [`### ${block.title}`, block.cards.map((c, i) => `${block.numbered ? `${i + 1}.` : '-'} **${c.heading}**${c.tag ? ` (${c.tag})` : ''}${c.text ? ` ${c.text}` : ''}`).join('\n')].join('\n\n');
    case 'thesis_bento':
      return block.columns.map((c) => `### ${c.title}\n\n${c.items.map((i) => `- ${i}`).join('\n')}`).join('\n\n');
  }
}

/** The report as markdown (tables as pipe tables), for saving into a note and for clients that do not draw blocks. */
export function blocksToMarkdown(blocks: readonly ResearchBlock[]): string {
  return blocks.map(blockMarkdown).filter((m): m is string => m !== null).join('\n\n');
}
