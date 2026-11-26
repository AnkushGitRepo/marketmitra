// The model calls that write the head-to-head report's chapters (#394): what each is asked, what it may search, and the facts it gets.
// Replies are read with the company report's chapter parser.

import { RESEARCH_COMPARE_SYSTEM } from '@/lib/ai/prompts';
import type { FactBlock } from '@/lib/ai/researchPrompts';
import type { SearchBudget } from '@/lib/ai/research/webTools';
import { untrusted } from '@/lib/ai/untrusted';
import type { GroundingPassage } from '@/lib/rag/insightContext';
import { blocksToMarkdown } from '../blocksMarkdown';
import type { ResearchBlock } from '../blocks';
import { formatNumber } from '../formatters';
import { chapterMeta, type CompareChapterId } from '../report/chapters';
import { SEARCH_HEAVY, SEARCH_LIGHT } from '../report/tasks';
import type { CompareCompany } from './analysis';

export type CompareTaskId = 'business' | 'issues' | 'outlook' | 'verdict' | 'questions' | 'structure';

export interface CompareTask {
  readonly id: CompareTaskId;
  readonly chapters: readonly CompareChapterId[];
  readonly system: string;
  readonly prompt: string;
  /** Null: the call does not search the web. */
  readonly search: SearchBudget | null;
  readonly groundingQuery: string;
}

/** Written after the first batch, from what it found. */
export const LATER_TASKS: readonly CompareTaskId[] = ['verdict'];

const GUIDANCE: Record<CompareChapterId, string> = {
  cmp_verdict:
    'Who leads on each of the four category cards (scale, profitability and ROCE, balance-sheet safety, growth momentum) and why, in plain terms, using the findings of the other chapters; where the companies differ most; and anything that makes a card misleading (for example a company with negative net worth that looks "safe" on a debt ratio). Do not restate the cards. End with the one or two facts that decide which company suits which kind of reader, stated as trade-offs, not advice.',
  cmp_trajectory:
    'Read the combined chart: how each company’s revenue and operating profit have moved over the years shown, who is pulling ahead or falling behind, how margins differ, and what drives the divergence. The years marked E are each company’s own trend carried forward and fading, not analyst forecasts: say what the trend assumes, and where a source you found gives analyst consensus or company guidance for the next years, quote it with its source and date and say how it differs from the projection.',
  cmp_matrix:
    'Read the head-to-head table (valuation, returns, leverage, growth) and say who leads on each and what the gaps mean. Then write a short list headed "Sector measures": the three to five operating measures that matter most in this sector (for telecom: average revenue per user, subscriber market share, 5G users, net debt to EBITDA; for banks: net interest margin, gross NPA, CASA ratio, return on assets; for IT services: constant-currency growth, EBIT margin, attrition; choose the ones that fit these companies). Each bullet is the measure, then each company’s figure with its source and date, or "not found" for the company it could not be found for.',
  cmp_profiles:
    'One short paragraph per company, each headed by its symbol in bold: what it does, its revenue segments and geography, its main competitive strength, what it does better than the others and where it trails them. Say what each does differently, not only what each is.',
  cmp_issues:
    'For each company, in turn, the issues that matter most now: litigation and regulatory matters, debt and funding, governance, operational bottlenecks and concentration, each grounded in a named case, a figure or a dated event, and tagged in the text as critical, moderate or a watch-item. Where one company’s issue is a competitive advantage for another, say so. A company with few issues found says that plainly.',
  cmp_valuation:
    'Read the P/E bars and the "is the multiple earned" table: whether a higher multiple is backed by higher returns and growth, which company costs most per point of growth, and which looks expensive or cheap for a reason (falling profits, high debt, negative earnings). Do not invent a historical median or a peer multiple; give one only if a source states it, with its date.',
  cmp_questions:
    'Six to eight questions that separate these particular companies, each a real trade-off between them (for example "Is Jio’s lower debt worth Airtel’s higher ARPU?"). Write the lines "1. ", "2. " and so on with no blank line between them. Each line is the question in bold, then a dash and one sentence on the figure or event that would answer it and where to find it. Neutral: no view on which to buy.',
};

const SEARCH_NOTE = 'Search the web for the facts the data does not hold, and cite the source and its date.';

const factsText = (blocks: readonly FactBlock[]): string => blocks.map((b) => `### ${b.heading}\n${b.body.trim()}`).join('\n\n');

const groundingText = (passages: readonly GroundingPassage[]): string =>
  passages.length === 0
    ? 'Retrieved context: none was found in the indexed news, filings or notes.'
    : `Retrieved context (indexed news, filings and notes):\n${passages.map((p) => `- (${p.source}) ${p.text}`).join('\n')}`;

const chapterList = (ids: readonly CompareChapterId[]): string => ids.map((id) => `## CHAPTER: ${id}\n(${chapterMeta(id).title}) ${GUIDANCE[id]}`).join('\n\n');

const n = (v: number | null, unit = ''): string => (v === null ? 'n/a' : `${formatNumber(v, 2)}${unit}`);

/** One line per company with its figures, so the model quotes the same numbers the tables show. */
export function companyFacts(companies: readonly CompareCompany[]): FactBlock[] {
  const rows = companies.map(
    (c) =>
      `- ${untrusted(c.name, 80)} (NSE: ${c.symbol}), ${untrusted(c.sector ?? 'sector unknown', 60)} / ${untrusted(c.industry ?? 'industry unknown', 60)}: market cap ₹${n(c.marketCap)} crore, P/E ${n(c.pe)}, P/B ${n(c.pb)}, ROCE ${n(c.roce, '%')}, ROE ${n(c.roe, '%')}, debt/equity ${n(c.debtToEquity)}, dividend yield ${n(c.dividendYield, '%')}, sales 3y CAGR ${n(c.salesCagr3y, '%')}, profit 3y CAGR ${n(c.profitCagr3y, '%')}`
  );
  return [{ heading: `The companies compared (${companies.length})`, body: rows.join('\n') }];
}

const tables = (title: string, blocks: readonly ResearchBlock[]): FactBlock[] => {
  const markdown = blocksToMarkdown(blocks);
  return markdown ? [{ heading: title, body: markdown }] : [];
};

export interface CompareBlocks {
  readonly cmp_verdict: readonly ResearchBlock[];
  readonly cmp_trajectory: readonly ResearchBlock[];
  readonly cmp_matrix: readonly ResearchBlock[];
  readonly cmp_valuation: readonly ResearchBlock[];
}

function build(subject: string, ids: readonly CompareChapterId[], facts: readonly FactBlock[], passages: readonly GroundingPassage[]): string {
  return [`Subject: a head-to-head comparison of ${subject}.`, `Write these chapters, in this order, each under its "## CHAPTER: <id>" line:\n\n${chapterList(ids)}`, factsText(facts), groundingText(passages)].join('\n\n');
}

const subjectOf = (companies: readonly CompareCompany[]): string => companies.map((c) => `${untrusted(c.name, 80)} (NSE: ${c.symbol})`).join(', ');

export function buildCompareTasks(companies: readonly CompareCompany[], blocks: CompareBlocks, grounding: Readonly<Record<'business' | 'issues' | 'outlook' | 'verdict', readonly GroundingPassage[]>>): CompareTask[] {
  const subject = subjectOf(companies);
  const names = companies.map((c) => c.name).join(' ');
  const profile = companyFacts(companies);
  const task = (id: CompareTaskId, chapters: readonly CompareChapterId[], search: SearchBudget | null, query: string, facts: readonly FactBlock[], passages: readonly GroundingPassage[]): CompareTask => ({
    id,
    chapters,
    system: RESEARCH_COMPARE_SYSTEM,
    search,
    groundingQuery: query,
    prompt: build(subject, chapters, [...facts, ...(search ? [{ heading: 'Searching', body: SEARCH_NOTE }] : [])], passages),
  });
  return [
    task('business', ['cmp_profiles', 'cmp_matrix'], SEARCH_HEAVY, `${names} business model segments market share operating metrics`, [...profile, ...tables('Computed head-to-head table', blocks.cmp_matrix)], grounding.business),
    task('issues', ['cmp_issues'], SEARCH_HEAVY, `${names} litigation regulatory debt dues governance risk`, profile, grounding.issues),
    task('outlook', ['cmp_trajectory', 'cmp_valuation'], SEARCH_LIGHT, `${names} revenue growth guidance analyst consensus valuation`, [...profile, ...tables('Computed trajectory (years marked E are a projection)', blocks.cmp_trajectory), ...tables('Computed valuation against growth', blocks.cmp_valuation)], grounding.outlook),
    task('verdict', ['cmp_verdict'], null, `${names} comparison`, [...profile, ...tables('Computed category leaders', blocks.cmp_verdict)], grounding.verdict),
  ];
}

const FINDINGS_CHARS = 1800;
const SUMMARY_CHARS = 600;
const FINDING_ORDER: readonly CompareChapterId[] = ['cmp_matrix', 'cmp_profiles', 'cmp_issues', 'cmp_trajectory', 'cmp_valuation'];

/** A task with the chapters already written added to its prompt, so it reads their findings instead of guessing. */
export function withFindings(task: CompareTask, prose: Readonly<Partial<Record<CompareChapterId, string>>>): CompareTask {
  const found = FINDING_ORDER.flatMap((id) => (prose[id] ? [`### Findings already written: ${chapterMeta(id).title}\n${prose[id]!.replace(/\s+/g, ' ').slice(0, FINDINGS_CHARS)}`] : []));
  return found.length === 0 ? task : { ...task, prompt: `${task.prompt}\n\n${found.join('\n\n')}` };
}

/** The questions call: no search, only a short summary of each chapter already written. */
export function buildQuestionsTask(companies: readonly CompareCompany[], prose: Readonly<Partial<Record<CompareChapterId, string>>>): CompareTask {
  const summaries = (Object.entries(prose) as [CompareChapterId, string][]).map(([id, text]) => ({ heading: `Chapter summary: ${chapterMeta(id).title}`, body: text.replace(/\s+/g, ' ').slice(0, SUMMARY_CHARS) }));
  return { id: 'questions', chapters: ['cmp_questions'], system: RESEARCH_COMPARE_SYSTEM, search: null, groundingQuery: '', prompt: build(subjectOf(companies), ['cmp_questions'], [...companyFacts(companies), ...summaries], []) };
}
