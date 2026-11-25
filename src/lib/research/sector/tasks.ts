// The model calls that write the sector report's chapters (#380): what each is asked, what it may search, and the facts it gets.
// Replies are read with the company report's chapter parser.

import { RESEARCH_SECTOR_SYSTEM } from '@/lib/ai/prompts';
import type { FactBlock } from '@/lib/ai/researchPrompts';
import type { SearchBudget } from '@/lib/ai/research/webTools';
import { untrusted } from '@/lib/ai/untrusted';
import type { GroundingPassage } from '@/lib/rag/insightContext';
import { blocksToMarkdown } from '../blocksMarkdown';
import { chapterMeta, type SectorChapterId } from '../report/chapters';
import { SEARCH_HEAVY, SEARCH_LIGHT } from '../report/tasks';
import type { ResearchBlock } from '../blocks';
import type { SectorInputs } from './inputs';

export type SectorTaskId = 'economics' | 'numbers' | 'ecosystem' | 'outlook' | 'risks' | 'checklist' | 'structure';

export interface SectorTask {
  readonly id: SectorTaskId;
  readonly chapters: readonly SectorChapterId[];
  readonly system: string;
  readonly prompt: string;
  /** Null: the call does not search the web. */
  readonly search: SearchBudget | null;
  readonly groundingQuery: string;
}

const GUIDANCE: Record<SectorChapterId, string> = {
  sx_overview:
    'How the sector actually makes money: the value chain from inputs to the end customer, who captures the margin at each stage, unit economics and the measures the sector itself uses (for example order book and book-to-bill in capital goods, ARPU in telecom, net interest margin in lending), working-capital intensity, capex intensity, and the barriers that keep new entrants out. Say how large the sector is and how fast it is growing, with dated sources.',
  sx_scorecard:
    'Read the scorecard: what the aggregate size, the median P/E, ROCE and ROE and the three-year growth say about the sector, how dispersed the companies are (a wide spread means the median hides a lot), and what the growth chart shows. Do not invent a historical valuation band; if you find one in a source, cite it.',
  sx_leaders:
    'Compare the top listed companies in the table (the leaders by market cap, and the "who leads" table): what each specialises in, who leads on margins, return on capital, growth and balance-sheet strength, and what each is doing right or differently from peers, with a sector-specific measure such as order-book visibility or R&D intensity where a source gives it. Search for the one or two facts that explain why the leaders lead.',
  sx_unlisted:
    'Unlisted and private companies, start-ups, state-owned spin-offs and joint ventures that are shaping or supplying the sector, and the IPO pipeline: companies that have filed or announced a listing. Name only those a source supports, with what each does and the source and date. If few can be found, say so plainly.',
  sx_global:
    'How Indian companies compare with the global leaders in this sector: scale, R&D as a share of revenue, export share, valuation multiples, and technology or manufacturing partnerships. Name the global peers and give figures only where a source supports them; otherwise describe the gap qualitatively and say the figure was not found.',
  sx_outlook:
    'The three to five year outlook: structural demand drivers, government and private capex cycles, indigenisation or import substitution, export opportunities and the catalysts that could change the picture (technology shifts, large contracts, budget allocations). Separate what is already announced and funded from what is hoped for, and give dates.',
  sx_policy:
    'The rules and policies that shape the sector: the ministries and regulators, statutes, production-linked incentive or similar schemes, import restrictions and tariffs, licensing and procurement rules, pricing regulation, and the recent changes and decisions due. Give each policy with its name, year and what it changes in practice.',
  sx_risks:
    'Industry-wide litigation and governance risks and structural bottlenecks: payment and execution delays, procurement or licensing disputes, regulatory and legal cases involving several players, blacklisting or compliance risks, environmental clearances, state-owned company governance and dividend mandates, supply-chain and import dependence, cyclicality and valuation traps. Each point is grounded in a named case, a figure or a dated event.',
  sx_checklist:
    'Ten questions an investor should be able to answer before putting money in any company in this sector. Write exactly ten lines, each beginning "1. ", "2. " and so on up to "10. ", with no blank line between them. Each line is the question in bold, then a dash and one sentence on why it matters in this sector and what a good or worrying answer looks like. Make them specific to this sector (its own measures, its customers, its regulation), not generic, and cover order or demand visibility, working capital and receivables, margin durability, dependence on one customer or one input, balance-sheet strength, governance and policy dependence.',
};

const SEARCH_NOTE = 'Search the web for the facts the data does not hold, and cite the source and its date.';

const factsText = (blocks: readonly FactBlock[]): string => blocks.map((b) => `### ${b.heading}\n${b.body.trim()}`).join('\n\n');

const groundingText = (passages: readonly GroundingPassage[]): string =>
  passages.length === 0
    ? 'Retrieved context: none was found in the indexed news, filings or notes.'
    : `Retrieved context (indexed news, filings and notes):\n${passages.map((p) => `- (${p.source}) ${p.text}`).join('\n')}`;

const chapterList = (ids: readonly SectorChapterId[]): string =>
  ids.map((id) => `## CHAPTER: ${id}\n(${chapterMeta(id).title}) ${GUIDANCE[id]}`).join('\n\n');

export function sectorProfileFacts(inputs: SectorInputs): FactBlock[] {
  const covers = [...inputs.sectors, ...inputs.industries].map((n) => untrusted(n, 80)).join('; ');
  return [
    {
      heading: `Sector: ${untrusted(inputs.label, 80)}`,
      body: `Listed companies in the data: ${inputs.count}. Data service industries covered: ${covers || '—'}. The figures below are for the ${inputs.rows.length} largest by market cap.`,
    },
  ];
}

const tablesFor = (title: string, blocks: readonly ResearchBlock[]): FactBlock[] => {
  const markdown = blocksToMarkdown(blocks);
  return markdown ? [{ heading: title, body: markdown }] : [];
};

export interface SectorBlocks {
  readonly scorecard: readonly ResearchBlock[];
  readonly leaders: readonly ResearchBlock[];
}

function build(inputs: SectorInputs, ids: readonly SectorChapterId[], facts: readonly FactBlock[], passages: readonly GroundingPassage[]): string {
  return [`Subject: the Indian "${untrusted(inputs.label, 80)}" sector.`, `Write these chapters, in this order, each under its "## CHAPTER: <id>" line:\n\n${chapterList(ids)}`, factsText(facts), groundingText(passages)].join('\n\n');
}

export function buildSectorTasks(inputs: SectorInputs, blocks: SectorBlocks, grounding: Readonly<Record<Exclude<SectorTaskId, 'checklist' | 'structure'>, readonly GroundingPassage[]>>): SectorTask[] {
  const label = inputs.label;
  const profile = sectorProfileFacts(inputs);
  const scorecard = tablesFor('Computed sector scorecard', blocks.scorecard);
  const leaders = tablesFor('Computed leaders tables', blocks.leaders);
  const task = (id: SectorTaskId, chapters: readonly SectorChapterId[], search: SearchBudget | null, query: string, facts: readonly FactBlock[], passages: readonly GroundingPassage[]): SectorTask => ({
    id,
    chapters,
    system: RESEARCH_SECTOR_SYSTEM,
    search,
    groundingQuery: query,
    prompt: build(inputs, chapters, [...facts, ...(search ? [{ heading: 'Searching', body: SEARCH_NOTE }] : [])], passages),
  });
  return [
    task('economics', ['sx_overview'], SEARCH_HEAVY, `${label} India sector value chain economics margins capex working capital`, [...profile, ...scorecard], grounding.economics),
    task('numbers', ['sx_scorecard', 'sx_leaders'], SEARCH_LIGHT, `${label} India leading listed companies order book margins R&D results`, [...profile, ...scorecard, ...leaders], grounding.numbers),
    task('ecosystem', ['sx_unlisted', 'sx_global'], SEARCH_HEAVY, `${label} India unlisted start-ups IPO pipeline global peers comparison`, [...profile, ...leaders], grounding.ecosystem),
    task('outlook', ['sx_outlook', 'sx_policy'], SEARCH_HEAVY, `${label} India outlook capex budget policy scheme regulation`, profile, grounding.outlook),
    task('risks', ['sx_risks'], SEARCH_HEAVY, `${label} India litigation regulator penalty delays governance supply chain risk`, [...profile, ...leaders], grounding.risks),
  ];
}

const SUMMARY_CHARS = 600;

/** The checklist call: no search, only a short summary of each chapter already written. */
export function buildChecklistTask(inputs: SectorInputs, prose: Readonly<Partial<Record<SectorChapterId, string>>>): SectorTask {
  const summaries = (Object.entries(prose) as [SectorChapterId, string][]).map(([id, text]) => ({ heading: `Chapter summary: ${chapterMeta(id).title}`, body: text.replace(/\s+/g, ' ').slice(0, SUMMARY_CHARS) }));
  return {
    id: 'checklist',
    chapters: ['sx_checklist'],
    system: RESEARCH_SECTOR_SYSTEM,
    search: null,
    groundingQuery: '',
    prompt: build(inputs, ['sx_checklist'], [...sectorProfileFacts(inputs), ...summaries], []),
  };
}
