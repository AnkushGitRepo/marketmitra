// The company research report as chapters (#360, ADR 0081): the types, the order, and the events a report streams as it is built.

import type { SourceRef } from '@/lib/ai/research/generateWithSearch';
import type { ToolCallRecord } from '@/lib/ai/research/webTools';
import type { ResearchBlock } from '../blocks';
import { blocksToMarkdown } from '../blocksMarkdown';
import type { SuggestedNote } from '../saveNote';
import { topSources } from './sources';

export type CompanyChapterId = 'overview' | 'financials' | 'peers' | 'sector' | 'regulatory' | 'legal' | 'management' | 'valuation' | 'risks';

/** The sector (theme) report's chapters; the `sx_` prefix keeps them apart from a company report's. */
export type SectorChapterId = 'sx_overview' | 'sx_scorecard' | 'sx_leaders' | 'sx_unlisted' | 'sx_global' | 'sx_outlook' | 'sx_policy' | 'sx_risks' | 'sx_checklist';

/** The portfolio report's chapters (#390); the `pf_` prefix keeps them apart from the others. */
export type PortfolioChapterId = 'pf_health' | 'pf_losers' | 'pf_factors' | 'pf_quality' | 'pf_scenarios' | 'pf_risks' | 'pf_checklist';

/** The head-to-head comparison's chapters (#394); the `cmp_` prefix keeps them apart from the others. */
export type CompareChapterId = 'cmp_verdict' | 'cmp_trajectory' | 'cmp_matrix' | 'cmp_profiles' | 'cmp_issues' | 'cmp_valuation' | 'cmp_questions';

export type ChapterId = CompanyChapterId | SectorChapterId | PortfolioChapterId | CompareChapterId;

export interface ChapterMeta {
  readonly id: ChapterId;
  readonly title: string;
  /** The label on the jump bar; the regulatory and legal chapters share one. */
  readonly nav: string;
}

export const COMPANY_CHAPTERS: readonly (ChapterMeta & { readonly id: CompanyChapterId })[] = [
  { id: 'overview', title: 'Business and thesis', nav: 'Overview' },
  { id: 'financials', title: 'Financials and cash flow', nav: 'Financials' },
  { id: 'peers', title: 'Peer benchmarking', nav: 'Peers' },
  { id: 'sector', title: 'Sector and industry', nav: 'Sector' },
  { id: 'regulatory', title: 'Regulatory and policy', nav: 'Regulatory & legal' },
  { id: 'legal', title: 'Litigation and governance', nav: 'Regulatory & legal' },
  { id: 'management', title: 'Management and capital allocation', nav: 'Management' },
  { id: 'valuation', title: 'Valuation and scenarios', nav: 'Valuation' },
  { id: 'risks', title: 'Risks and watch-items', nav: 'Risks' },
];

export const SECTOR_CHAPTERS: readonly (ChapterMeta & { readonly id: SectorChapterId })[] = [
  { id: 'sx_overview', title: 'Sector overview, value chain and economics', nav: 'Overview' },
  { id: 'sx_scorecard', title: 'Financial scorecard and growth', nav: 'Overview' },
  { id: 'sx_leaders', title: 'Top listed Indian companies', nav: 'Indian leaders' },
  { id: 'sx_unlisted', title: 'Unlisted innovators and the IPO pipeline', nav: 'Unlisted & global' },
  { id: 'sx_global', title: 'Global benchmarks', nav: 'Unlisted & global' },
  { id: 'sx_outlook', title: 'Outlook, capex cycle and catalysts', nav: 'Future & policy' },
  { id: 'sx_policy', title: 'Policy, regulation and government initiatives', nav: 'Future & policy' },
  { id: 'sx_risks', title: 'Litigation, governance red flags and bottlenecks', nav: 'Legal & risks' },
  { id: 'sx_checklist', title: 'Investor due-diligence checklist', nav: 'Investor checklist' },
];

export const PORTFOLIO_CHAPTERS: readonly (ChapterMeta & { readonly id: PortfolioChapterId })[] = [
  { id: 'pf_health', title: 'Portfolio health and return attribution', nav: 'Health' },
  { id: 'pf_losers', title: 'Drawdown forensics and winners check', nav: 'Drawdowns' },
  { id: 'pf_factors', title: 'Sector and hidden factor exposure', nav: 'Exposure' },
  { id: 'pf_quality', title: 'Quality and valuation scorecard', nav: 'Quality' },
  { id: 'pf_scenarios', title: 'Twelve-month scenario ranges', nav: 'Scenarios' },
  { id: 'pf_risks', title: 'Structural issues and risk register', nav: 'Risk register' },
  { id: 'pf_checklist', title: 'Stock-by-stock diligence checklist', nav: 'Checklist' },
];

export const COMPARE_CHAPTERS: readonly (ChapterMeta & { readonly id: CompareChapterId })[] = [
  { id: 'cmp_verdict', title: 'Category leaders and verdict', nav: 'Verdict' },
  { id: 'cmp_trajectory', title: 'Combined trajectory and projection', nav: 'Trajectory' },
  { id: 'cmp_matrix', title: 'Head-to-head matrix and sector measures', nav: 'Matrix' },
  { id: 'cmp_profiles', title: 'Company profiles and competitive edge', nav: 'Profiles' },
  { id: 'cmp_issues', title: 'Company-specific issues and red flags', nav: 'Issues' },
  { id: 'cmp_valuation', title: 'Valuation against growth', nav: 'Valuation' },
  { id: 'cmp_questions', title: 'Questions that separate these companies', nav: 'Questions' },
];

/**
 * Every chapter any report can have, in reading order. A report only ever holds one kind, and everything that walks this
 * list (the jump bar, the exports, the page) keeps just the chapters that are present.
 */
export const CHAPTERS: readonly ChapterMeta[] = [...COMPANY_CHAPTERS, ...SECTOR_CHAPTERS, ...PORTFOLIO_CHAPTERS, ...COMPARE_CHAPTERS];

export const chapterMeta = (id: ChapterId): ChapterMeta => CHAPTERS.find((c) => c.id === id) as ChapterMeta;

/**
 * `pending`: the figures are in but the text is still being written; `ready`: finished; `failed`: the text could not be
 * produced (the figures, if any, are still shown).
 */
export type ChapterStatus = 'pending' | 'ready' | 'failed';

export interface ReportChapter {
  readonly id: ChapterId;
  readonly title: string;
  readonly status: ChapterStatus;
  /** Cards, charts and tables computed from stored data. */
  readonly blocks: readonly ResearchBlock[];
  /** The model's text for the chapter (markdown), or null until it is written. */
  readonly prose: string | null;
  /** What the model searched and opened while writing the chapter. */
  readonly searched: readonly ToolCallRecord[];
  readonly sources: readonly SourceRef[];
  /** Why a chapter is `failed`, in words the reader can use. */
  readonly note?: string;
}

export type ReportEvent =
  | { readonly type: 'start'; readonly symbol: string; readonly name: string; readonly chapters: readonly { readonly id: ChapterId; readonly title: string }[] }
  | { readonly type: 'chapter'; readonly chapter: ReportChapter }
  | { readonly type: 'done'; readonly model: string; readonly generatedAt: string; readonly content: string; readonly note: SuggestedNote }
  | { readonly type: 'error'; readonly message: string };

export const pendingChapter = (id: ChapterId, blocks: readonly ResearchBlock[] = []): ReportChapter => ({
  id,
  title: chapterMeta(id).title,
  status: 'pending',
  blocks,
  prose: null,
  searched: [],
  sources: [],
});

/** Gemini's grounding links are long redirect addresses that mean nothing outside the page; for those the name alone is kept. */
const GROUNDING_HOST = 'vertexaisearch.cloud.google.com';

const isRedirect = (url: string): boolean => {
  try {
    return new URL(url).hostname === GROUNDING_HOST;
  } catch {
    return false;
  }
};

const sourcesMarkdown = (sources: readonly SourceRef[]): string =>
  sources.length === 0 ? '' : `Sources:\n${sources.map((s) => (isRedirect(s.url) ? `- ${s.title}` : `- ${s.title} (${s.url})`)).join('\n')}`;

/** The whole report as markdown (tables as pipe tables), for saving it into a note. A chapter that failed says so. */
export function chaptersToMarkdown(chapters: readonly ReportChapter[]): string {
  return CHAPTERS.flatMap(({ id, title }) => {
    const chapter = chapters.find((c) => c.id === id);
    if (!chapter) return [];
    const body = [
      blocksToMarkdown(chapter.blocks),
      chapter.prose ?? (chapter.status === 'failed' ? `*This chapter could not be written${chapter.note ? `: ${chapter.note}` : '.'}*` : ''),
      sourcesMarkdown(topSources(chapter.sources)),
    ].filter(Boolean);
    return body.length === 0 ? [] : [`## ${title}\n\n${body.join('\n\n')}`];
  }).join('\n\n');
}
