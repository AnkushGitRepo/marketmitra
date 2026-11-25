// The report as a plain-text file (#372): no HTML and no Markdown marks, tables aligned in columns, long text wrapped. Pure.

import type { DataTableBlock, ResearchBlock } from '../../blocks';
import { formatCell, formatNumber, formatPercent } from '../../formatters';
import { topSources } from '../sources';
import { CHAPTERS, type ReportChapter } from '../chapters';
import { parseMarkdownLite, type InlineToken } from '@/components/markdownLiteParse';
import { DISCLAIMER_TEXT } from './markdown';
import { reportDateLong, reportRef, type ExportMeta } from './meta';

const WIDTH = 78;
const RULE = '='.repeat(WIDTH);
const THIN = '-'.repeat(WIDTH);
const WIDE_TEXT_CHARS = 28;

/** Words wrapped to `width`, the first line starting with `first` and the rest with `hang`. */
export function wrap(text: string, width = WIDTH, first = '', hang = first): string {
  const lines: string[] = [];
  let line = first;
  let hasWord = false;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = hasWord ? `${line} ${word}` : `${line}${word}`;
    if (next.length > width && hasWord) {
      lines.push(line);
      line = `${hang}${word}`;
    } else {
      line = next;
    }
    hasWord = true;
  }
  if (hasWord) lines.push(line);
  return lines.join('\n');
}

const plain = (tokens: readonly InlineToken[]): string => tokens.map((t) => t.v).join('');

/** Markdown prose as plain paragraphs and "- " bullets, wrapped. Headings are written in capitals. */
export function proseText(markdown: string): string {
  return parseMarkdownLite(markdown)
    .map((b) => {
      switch (b.kind) {
        case 'h2':
        case 'h3':
        case 'h4':
          return plain(b.tokens).toUpperCase();
        case 'p':
          return wrap(plain(b.tokens));
        case 'ul':
          return b.items.map((i) => wrap(plain(i), WIDTH, '  - ', '    ')).join('\n');
        case 'ol':
          return b.items.map((i, n) => wrap(plain(i), WIDTH, `  ${n + 1}. `, '     ')).join('\n');
        case 'table':
          return [b.head.map(plain).join(' | '), ...b.rows.map((r) => r.map(plain).join(' | '))].join('\n');
        case 'pre':
          return b.text;
        case 'hr':
          return THIN;
      }
    })
    .join('\n\n');
}

function alignedTable(headers: readonly string[], rows: readonly (readonly string[])[], rightFrom: number): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const cell = (text: string, i: number) => (i >= rightFrom ? text.padStart(widths[i]) : text.padEnd(widths[i]));
  const line = (cells: readonly string[]) => cells.map(cell).join('  ').trimEnd();
  return [line(headers), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

function tableText(block: DataTableBlock): string {
  const title = [block.title, block.note ? wrap(block.note) : ''].filter(Boolean).join('\n');
  const formatted = block.rows.map((r) => block.columns.map((c) => formatCell(r[c.key] ?? null, c.format)));
  const wide = block.columns.some((c, i) => i > 0 && c.format === 'text' && formatted.reduce((n, r) => n + r[i].length, 0) / Math.max(formatted.length, 1) > WIDE_TEXT_CHARS);
  if (wide) {
    // Long text cannot sit in columns: write each row as a short record instead.
    const records = formatted.map((row, n) => `${n + 1}. ${block.columns.map((c, i) => (i === 0 ? row[i] : wrap(`${c.label}: ${row[i]}`, WIDTH, '   ', '     '))).join('\n')}`);
    return `${title}\n\n${records.join('\n\n')}`;
  }
  const firstNumeric = block.columns.findIndex((c, i) => i > 0 && c.format !== 'text');
  return `${title}\n\n${alignedTable(block.columns.map((c) => c.label), formatted, firstNumeric === -1 ? block.columns.length : firstNumeric)}`;
}

export function blockText(block: ResearchBlock): string {
  switch (block.type) {
    case 'kpi_grid':
      return block.items.map((i) => wrap(`${i.label}: ${i.value}${i.note ? ` (${i.note})` : ''}`, WIDTH, '', '  ')).join('\n');
    case 'data_table':
      return tableText(block);
    case 'financial_chart':
      return `${block.title} (${block.unit})\n\n${alignedTable(
        ['Year', 'Sales', 'Operating profit', 'OPM %', 'Sales growth'],
        block.periods.map((p) => [p.label, formatNumber(p.sales, 0), formatNumber(p.operatingProfit, 0), formatPercent(p.opm), formatPercent(p.salesGrowth)]),
        1
      )}`;
    case 'bar_chart':
      return `${block.title} (${block.unit})\n\n${alignedTable(
        ['', ...block.series.map((s) => s.name)],
        block.categories.map((cat, i) => [cat, ...block.series.map((s) => (s.values[i] == null ? '—' : formatNumber(s.values[i], Number.isInteger(s.values[i]) ? 0 : 1)))]),
        1
      )}`;
    case 'donut_chart': {
      const total = block.slices.reduce((a, s) => a + s.value, 0);
      return `${block.title}\n\n${block.slices.map((s) => `  ${s.label}: ${formatNumber(total === 0 ? 0 : (s.value / total) * 100)}%`).join('\n')}`;
    }
    case 'thesis_bento':
      return block.columns.map((c) => `${c.title}\n${c.items.map((i) => wrap(i, WIDTH, '  - ', '    ')).join('\n')}`).join('\n\n');
  }
}

export function reportText(chapters: readonly ReportChapter[], meta: ExportMeta): string {
  const shown = CHAPTERS.flatMap(({ id }) => chapters.filter((c) => c.id === id && (c.blocks.length > 0 || c.prose || c.status === 'failed')));
  const head = [RULE, 'MARKETMITRA RESEARCH', meta.kind === 'sector' ? meta.name : `${meta.name} (NSE: ${meta.symbol})`, `${reportRef(meta)} | ${reportDateLong(meta.generatedAt)} | written by ${meta.model}`, RULE, '', 'CONTENTS', ...shown.map((c, i) => `  ${String(i + 1).padStart(2, '0')}  ${c.title}`), '', wrap(DISCLAIMER_TEXT)].join('\n');
  const body = shown.map((c, i) => {
    const parts = [
      `${String(i + 1).padStart(2, '0')}. ${c.title.toUpperCase()}`,
      THIN,
      ...c.blocks.map(blockText),
      c.prose ? proseText(c.prose) : '',
      c.status === 'failed' ? wrap(`This chapter could not be written${c.note ? `: ${c.note}` : '.'}`) : '',
      c.sources.length > 0 ? wrap(`Sources: ${topSources(c.sources).map((s) => s.title).join('; ')}`) : '',
    ].filter(Boolean);
    return parts.join('\n\n').replace(`${THIN}\n\n`, `${THIN}\n\n`);
  });
  return `${[head, ...body].join(`\n\n${RULE}\n\n`)}\n\n${RULE}\n${wrap(DISCLAIMER_TEXT)}\n`;
}
