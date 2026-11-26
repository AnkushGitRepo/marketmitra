// What every export format needs to know about the report beside its chapters (#372).

import type { ResearchBlock } from '../../blocks';
import type { ReportChapter } from '../chapters';

export interface ExportMeta {
  /** A company report (the default), or a sector or portfolio report, which word the cover and the Word title for a group of companies. */
  readonly kind?: 'company' | 'sector' | 'portfolio' | 'compare';
  readonly symbol: string;
  readonly name: string;
  /** ISO timestamp of when the report was generated. */
  readonly generatedAt: string;
  readonly model: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The date part of an ISO timestamp, in India (the report's market), as yyyy-mm-dd. */
export function reportDate(generatedAt: string): string {
  const d = new Date(new Date(generatedAt).getTime() + 5.5 * 3_600_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "25 Nov 2026" for the document's own text. */
export function reportDateLong(generatedAt: string): string {
  const [y, m, d] = reportDate(generatedAt).split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]} ${y}`;
}

const safe = (text: string): string => text.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

/** A file name without its extension: MarketMitra-POLICYBZR-research-2026-11-25. */
export const reportFileBase = (meta: ExportMeta): string => `MarketMitra-${safe(meta.symbol)}-research-${reportDate(meta.generatedAt)}`;

/** A reference for the report: MM-20261125-POLICYBZR. It is a label for filing, not a registry number. */
export const reportRef = (meta: ExportMeta): string => `MM-${reportDate(meta.generatedAt).replace(/-/g, '')}-${safe(meta.symbol)}`;

/**
 * The chapters without the summary cards the cover or front matter already shows (the first card grid of the overview or
 * scorecard chapter, the one `headlineFigures` reads), so the same figures are not printed twice.
 */
export function withoutHeadline(chapters: readonly ReportChapter[]): ReportChapter[] {
  const source = chapters.find((c) => c.id === 'overview' || c.id === 'sx_scorecard' || c.id === 'pf_health' || c.id === 'cmp_verdict');
  const grid = source?.blocks.find((b) => b.type === 'kpi_grid');
  return chapters.map((c) => (c === source && grid ? { ...c, blocks: c.blocks.filter((b) => b !== grid) } : c));
}

export interface Headline {
  readonly label: string;
  readonly value: string;
  readonly note?: string;
}

/** The overview chapter's summary cards (market cap, P/E, ROCE, foreign holding), for the cover and the front matter. */
export function headlineFigures(chapters: readonly ReportChapter[]): Headline[] {
  const grid = chapters.find((c) => c.id === 'overview' || c.id === 'sx_scorecard' || c.id === 'pf_health' || c.id === 'cmp_verdict')?.blocks.find((b): b is Extract<ResearchBlock, { type: 'kpi_grid' }> => b.type === 'kpi_grid');
  return (grid?.items ?? []).map(({ label, value, note }) => ({ label, value, note }));
}

/** A sector or portfolio report: it has no single NSE symbol. */
export const isGroupReport = (meta: ExportMeta): boolean => meta.kind === 'sector' || meta.kind === 'portfolio' || meta.kind === 'compare';

/** How the cover and the Word file name what the report is about: a listed company has an NSE symbol, a sector or portfolio does not. */
export const subjectTag = (meta: ExportMeta): string => (meta.kind === 'sector' ? 'Sector report' : meta.kind === 'portfolio' ? 'Portfolio report' : meta.kind === 'compare' ? 'Head-to-head comparison' : `NSE: ${meta.symbol}`);
export const subjectInline = (meta: ExportMeta): string => (isGroupReport(meta) ? meta.name : `${meta.name} (${meta.symbol})`);
export const kindLabel = (meta: ExportMeta): string => (meta.kind === 'sector' ? 'SECTOR RESEARCH REPORT' : meta.kind === 'portfolio' ? 'PORTFOLIO RESEARCH REPORT' : meta.kind === 'compare' ? 'HEAD-TO-HEAD COMPARISON' : 'COMPANY RESEARCH REPORT');
export const kindTagline = (meta: ExportMeta): string => `Independent ${meta.kind === 'sector' ? 'sector' : meta.kind === 'portfolio' ? 'portfolio' : meta.kind === 'compare' ? 'head-to-head' : 'company'} research from public data`;
