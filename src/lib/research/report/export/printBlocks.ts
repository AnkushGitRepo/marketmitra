// Report blocks as HTML for the print document (#372). Pure; every piece of text is escaped.

import type { DataTableBlock, KpiGridBlock, ResearchBlock, ThesisBentoBlock } from '../../blocks';
import { bestRows } from '../../chartMath';
import { formatCell } from '../../formatters';
import { escapeHtml } from './html';
import { barChartHtml, donutHtml, financialChartSvg } from './printCharts';

const MIN_WEIGHT = 1;
const MIN_TEXT_WEIGHT = 1.4;
const MAX_TEXT_WEIGHT = 6;
const CHARS_PER_WEIGHT = 11;
const HEADER_CHARS_PER_WEIGHT = 6;
const LABEL_WEIGHT = 1.7;

/**
 * Column widths for a fixed-layout table, as percentages that sum to 100, so every column fits the page. A number column gets one
 * share, long text gets more (up to a cap), and no column is narrower than its own header word needs, so "Probability" or "Medium"
 * is never split mid-word.
 */
export function columnWidths(block: DataTableBlock): number[] {
  const weights = block.columns.map((c, i) => {
    const byHeader = c.label.length / HEADER_CHARS_PER_WEIGHT;
    if (c.format !== 'text') return Math.max(MIN_WEIGHT, byHeader / 1.5);
    const lengths = block.rows.map((r) => String(r[c.key] ?? '').length);
    const average = lengths.length === 0 ? 0 : lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const byText = Math.max(MIN_TEXT_WEIGHT, average / CHARS_PER_WEIGHT, byHeader);
    return i === 0 ? Math.max(LABEL_WEIGHT, Math.min(byText, 3)) : Math.min(MAX_TEXT_WEIGHT, byText);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => Math.round((w / total) * 1000) / 10);
  // Rounding can leave the sum a hair off 100; the last column absorbs it.
  const drift = Math.round((100 - widths.reduce((a, b) => a + b, 0)) * 10) / 10;
  return widths.map((w, i) => (i === widths.length - 1 ? Math.round((w + drift) * 10) / 10 : w));
}

function kpiGrid(block: KpiGridBlock): string {
  return `<div class="kpis">${block.items
    .map((i) => `<div class="kpi"><span class="kl">${escapeHtml(i.label)}</span><span class="kv">${escapeHtml(i.value)}</span>${i.note ? `<span class="kn" data-tone="${i.tone ?? 'neutral'}">${escapeHtml(i.note)}</span>` : ''}</div>`)
    .join('')}</div>`;
}

function dataTable(block: DataTableBlock): string {
  const widths = columnWidths(block);
  const best = new Map(block.columns.filter((c) => c.best).map((c) => [c.key, bestRows(block.rows.map((r) => r[c.key] ?? null), c.best!)]));
  const head = block.columns.map((c) => `<th class="${c.format === 'text' ? 'l' : 'r'}">${escapeHtml(c.label)}</th>`).join('');
  const rows = block.rows
    .map(
      (row, ri) =>
        `<tr>${block.columns.map((c) => `<td class="${c.format === 'text' ? 'l' : 'r'}"${best.get(c.key)?.has(ri) ? ' data-best="true"' : ''}>${escapeHtml(formatCell(row[c.key] ?? null, c.format))}</td>`).join('')}</tr>`
    )
    .join('');
  return `<figure class="tbl"><figcaption>${escapeHtml(block.title)}</figcaption>${block.note ? `<p class="note">${escapeHtml(block.note)}</p>` : ''}<table><colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></figure>`;
}

function thesis(block: ThesisBentoBlock): string {
  return `<div class="bento">${block.columns.map((c) => `<section data-tone="${c.tone}"><h4>${escapeHtml(c.title)}</h4><ul>${c.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul></section>`).join('')}</div>`;
}

export function blockHtml(block: ResearchBlock): string {
  switch (block.type) {
    case 'kpi_grid':
      return kpiGrid(block);
    case 'data_table':
      return dataTable(block);
    case 'financial_chart':
      return `<figure class="chart"><figcaption>${escapeHtml(block.title)} <span>${escapeHtml(block.unit)}</span></figcaption>${financialChartSvg(block)}</figure>`;
    case 'bar_chart':
      return `<figure class="chart"><figcaption>${escapeHtml(block.title)} <span>${escapeHtml(block.unit)}</span></figcaption>${barChartHtml(block)}</figure>`;
    case 'donut_chart':
      return `<figure class="chart"><figcaption>${escapeHtml(block.title)}</figcaption>${donutHtml(block)}</figure>`;
    case 'thesis_bento':
      return thesis(block);
  }
}
