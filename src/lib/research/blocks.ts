// The visual blocks of a research report (#354). Built on the server from stored figures, never written by
// the model, so a number on a card, chart or table always comes from the data and never from a generation.

import type { FinancialPeriod } from './financialSeries';

export type CellFormat = 'text' | 'crore' | 'number' | 'multiple' | 'percent' | 'rupee';
export type Tone = 'positive' | 'negative' | 'neutral';

export interface KpiItem {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
  readonly tone?: Tone;
}
export interface KpiGridBlock {
  readonly type: 'kpi_grid';
  readonly items: readonly KpiItem[];
}

export interface ChartSeries {
  readonly name: string;
  readonly values: readonly (number | null)[];
}
export interface BarChartBlock {
  readonly type: 'bar_chart';
  readonly title: string;
  /** Shown beside the title, e.g. "₹ Cr" or "%". */
  readonly unit: string;
  readonly orientation: 'vertical' | 'horizontal';
  readonly categories: readonly string[];
  readonly series: readonly ChartSeries[];
}

export interface DonutSlice {
  readonly label: string;
  readonly value: number;
}
export interface DonutChartBlock {
  readonly type: 'donut_chart';
  readonly title: string;
  readonly slices: readonly DonutSlice[];
}

export type TableCell = string | number | null;
export interface TableColumn {
  readonly key: string;
  readonly label: string;
  readonly format: CellFormat;
  /** Which end of the column is the best one; that cell is highlighted. Omitted: no highlight. */
  readonly best?: 'high' | 'low';
}
export interface DataTableBlock {
  readonly type: 'data_table';
  readonly title: string;
  /** A line under the title: what the table is and is not. */
  readonly note?: string;
  readonly columns: readonly TableColumn[];
  readonly rows: readonly Readonly<Record<string, TableCell>>[];
}

export interface ThesisColumn {
  readonly title: string;
  readonly tone: 'positive' | 'risk' | 'question';
  readonly items: readonly string[];
}
export interface ThesisBentoBlock {
  readonly type: 'thesis_bento';
  readonly columns: readonly ThesisColumn[];
}

/** Sales, operating profit and margin by fiscal year, drawn as one combined chart with a table view. */
export interface FinancialChartBlock {
  readonly type: 'financial_chart';
  readonly title: string;
  readonly unit: string;
  readonly periods: readonly FinancialPeriod[];
}

export type ResearchBlock = KpiGridBlock | BarChartBlock | DonutChartBlock | DataTableBlock | ThesisBentoBlock | FinancialChartBlock;

/** The blocks that exist, in order: a builder returns null for a block it has no data for. */
export function compactBlocks(blocks: readonly (ResearchBlock | null)[]): ResearchBlock[] {
  return blocks.filter((b): b is ResearchBlock => b !== null);
}
