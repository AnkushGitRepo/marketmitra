// The company research report as chapters (#360, ADR 0081): the types, the order, and the events a report streams as it is built.

import type { SourceRef } from '@/lib/ai/research/generateWithSearch';
import type { ToolCallRecord } from '@/lib/ai/research/webTools';
import type { ResearchBlock } from '../blocks';
import { blocksToMarkdown } from '../blocksMarkdown';
import type { SuggestedNote } from '../saveNote';

export type CompanyChapterId = 'overview' | 'financials' | 'peers' | 'sector' | 'regulatory' | 'legal' | 'management' | 'valuation' | 'risks';

/** The sector (theme) report's chapters; the `sx_` prefix keeps them apart from a company report's. */
export type SectorChapterId = 'sx_overview' | 'sx_scorecard' | 'sx_leaders' | 'sx_unlisted' | 'sx_global' | 'sx_outlook' | 'sx_policy' | 'sx_risks' | 'sx_checklist';

export type ChapterId = CompanyChapterId | SectorChapterId;

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

/**
 * Every chapter either report can have, in reading order. A report only ever holds one kind, and everything that walks this
 * list (the jump bar, the exports, the page) keeps just the chapters that are present.
 */
export const CHAPTERS: readonly ChapterMeta[] = [...COMPANY_CHAPTERS, ...SECTOR_CHAPTERS];

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
      sourcesMarkdown(chapter.sources),
    ].filter(Boolean);
    return body.length === 0 ? [] : [`## ${title}\n\n${body.join('\n\n')}`];
  }).join('\n\n');
}
