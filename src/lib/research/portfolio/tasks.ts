// The model calls that write the portfolio report's chapters (#390): what each is asked, what it may search, and the facts it gets.
// Replies are read with the company report's chapter parser.

import { RESEARCH_PORTFOLIO_SYSTEM } from '@/lib/ai/prompts';
import type { FactBlock } from '@/lib/ai/researchPrompts';
import type { SearchBudget } from '@/lib/ai/research/webTools';
import { untrusted } from '@/lib/ai/untrusted';
import type { GroundingPassage } from '@/lib/rag/insightContext';
import { blocksToMarkdown } from '../blocksMarkdown';
import type { ResearchBlock } from '../blocks';
import { formatNumber } from '../formatters';
import { chapterMeta, type PortfolioChapterId } from '../report/chapters';
import { SEARCH_HEAVY, SEARCH_LIGHT } from '../report/tasks';
import { holdingsToSearch, severityOf, totalValue, type Position } from './analysis';
import type { portfolioChapterBlocks } from './blocks';

/** The first batch of calls: the attribution chapter is written after them, from what they found. */
export const LATER_TASKS: readonly PortfolioTaskId[] = ['attribution'];

export type PortfolioTaskId = 'attribution' | 'forensics' | 'exposure' | 'risks' | 'checklist';

export interface PortfolioTask {
  readonly id: PortfolioTaskId;
  readonly chapters: readonly PortfolioChapterId[];
  readonly system: string;
  readonly prompt: string;
  /** Null: the call does not search the web. */
  readonly search: SearchBudget | null;
  readonly groundingQuery: string;
}

const GUIDANCE: Record<PortfolioChapterId, string> = {
  pf_health:
    'Read the health strip and the attribution chart: how much of the result the biggest winners carry, how the losers drag it, and what the health score’s deductions are. Say what the result would be without the top two winners. Do not restate the cards.',
  pf_losers:
    'For every holding below cost, in the order of the severity table (CRITICAL first), write a short entry headed by the symbol and its severity: **Why it is down** (the earnings, margin, asset-quality, regulatory, pricing or valuation driver, from your searches, with source and date), **Balance sheet and valuation** (what the P/E, ROE, debt to equity and growth figures say), and **Recovery watch-item** (the one measurable thing that would show it turning). Cover all of them; a short entry is fine for a mild loss. Then add a line "### Winners: valuation and concentration check" and up to three bullets, one for each of the biggest gainers in the winners table: what its P/E and P/B say next to its ROE and growth (is the price already assuming a lot?), how much of the book and of the gain it is, and the one thing that would test it. Neutral: no view on whether to hold, trim or sell.',
  pf_factors:
    'What the book is really exposed to beyond sector labels: the rate and credit cycle, global and export demand, regulated pricing and policy, domestic consumption. Tie each driver to the named holdings that carry it and say what would hurt or help them, with a dated source where you found one. Point out where several holdings share one hidden risk.',
  pf_quality:
    'Read the weighted figures and the table: whether the portfolio’s profitability (ROCE, ROE), leverage and valuation (P/E) are strong or weak, which holdings pull each figure up or down, any stretched multiple, any holding whose cheap valuation looks like a warning rather than a bargain (falling profits, high debt), and the loss-making ones. Do not invent a benchmark figure; give an index multiple only if a source states it.',
  pf_scenarios:
    'Explain the range: the bear, base and bull values are one volatility down, unchanged and one volatility up, from the holdings’ own one-year price swings. Say which holdings and sectors drive the swing, why the range is an upper bound (it assumes holdings move together), and what regime or event would push the book to each end, with dated sources. No expected return, no probability.',
  pf_risks:
    'Read the risk register: for each item say why it matters for this particular book and what would change it, in the order given. Add any portfolio-level risk the figures show that the register does not (for example illiquid small positions), only if the data supports it.',
  pf_checklist:
    'One specific thing to verify at the next review for each holding that needs it (up to ten, the most important first). Write the lines "1. ", "2. " and so on with no blank line between them. Each line is the holding and the thing to check in bold (for example **Bandhan Bank: is microfinance slippage still rising?**), then a dash and one sentence on the figure or event to look at and where to find it (a quarterly result, an exchange filing, a regulator notice). Make each specific to that company, not generic.',
};

const SEARCH_NOTE = 'Search the web for the recent news, results and regulatory developments the data does not hold, and cite the source and its date.';

const factsText = (blocks: readonly FactBlock[]): string => blocks.map((b) => `### ${b.heading}\n${b.body.trim()}`).join('\n\n');

const groundingText = (passages: readonly GroundingPassage[]): string =>
  passages.length === 0
    ? 'Retrieved context: none was found in the indexed news, filings or notes.'
    : `Retrieved context (indexed news, filings and notes):\n${passages.map((p) => `- (${p.source}) ${p.text}`).join('\n')}`;

const chapterList = (ids: readonly PortfolioChapterId[]): string => ids.map((id) => `## CHAPTER: ${id}\n(${chapterMeta(id).title}) ${GUIDANCE[id]}`).join('\n\n');

const num = (v: number | null | undefined, unit = ''): string => (v === null || v === undefined ? 'n/a' : `${formatNumber(v)}${unit}`);

/** One line per holding: what was paid, where it is, how deep the loss is and the company's own figures. */
export function holdingsFacts(positions: readonly Position[], omitted: number): FactBlock[] {
  const rows = positions.map((p) => {
    const f = p.fundamentals;
    return `- ${untrusted(p.name, 80)} (${p.symbol}), ${untrusted(p.sector ?? 'sector unknown', 60)}${f?.industry ? ` / ${untrusted(f.industry, 60)}` : ''}: weight ${num(p.weightPct, '%')}, cost ₹${num(p.avgPrice)}, price ${p.ltp === null ? 'no live price' : `₹${num(p.ltp)}`}, vs cost ${num(p.plPct, '%')}${severityOf(p.plPct) ? ` [${severityOf(p.plPct)}]` : ''} | P/E ${num(f?.pe)}, P/B ${num(f?.pb)}, ROCE ${num(f?.roce, '%')}, ROE ${num(f?.roe, '%')}, debt/equity ${num(f?.debt_to_equity)}, sales 3y ${num(f?.sales_growth_3y_cagr, '%')}, profit 3y ${num(f?.profit_growth_3y_cagr, '%')}, market cap ₹${num(f?.market_cap)} crore, volatility ${num(p.volatilityPct, '%')}`;
  });
  return [
    { heading: `The portfolio: ${positions.length} holdings, value ₹${num(totalValue(positions))}`, body: `${rows.join('\n')}${omitted > 0 ? `\n(${omitted} smaller holdings are not covered.)` : ''}` },
  ];
}

const tables = (title: string, blocks: readonly ResearchBlock[]): FactBlock[] => {
  const markdown = blocksToMarkdown(blocks);
  return markdown ? [{ heading: title, body: markdown }] : [];
};

type ChapterBlocks = ReturnType<typeof portfolioChapterBlocks>;

function build(ids: readonly PortfolioChapterId[], facts: readonly FactBlock[], passages: readonly GroundingPassage[]): string {
  return ['Subject: the reader’s own Indian stock portfolio.', `Write these chapters, in this order, each under its "## CHAPTER: <id>" line:\n\n${chapterList(ids)}`, factsText(facts), groundingText(passages)].join('\n\n');
}

/** The names a search is aimed at: the holdings well below cost and the large positions. */
export function searchTargets(positions: readonly Position[]): FactBlock[] {
  const targets = holdingsToSearch(positions);
  return targets.length === 0
    ? []
    : [{ heading: 'Search these holdings', body: `${SEARCH_NOTE} Start with: ${targets.map((p) => `${untrusted(p.name, 80)} (NSE: ${p.symbol})`).join('; ')}.` }];
}

export function buildPortfolioTasks(positions: readonly Position[], omitted: number, blocks: ChapterBlocks, grounding: Readonly<Record<Exclude<PortfolioTaskId, 'checklist'>, readonly GroundingPassage[]>>): PortfolioTask[] {
  const holdings = holdingsFacts(positions, omitted);
  const targets = searchTargets(positions);
  const names = holdingsToSearch(positions).map((p) => p.name).join(' ');
  const task = (id: PortfolioTaskId, chapters: readonly PortfolioChapterId[], search: SearchBudget | null, query: string, facts: readonly FactBlock[], passages: readonly GroundingPassage[]): PortfolioTask => ({
    id,
    chapters,
    system: RESEARCH_PORTFOLIO_SYSTEM,
    search,
    groundingQuery: query,
    prompt: build(chapters, [...facts, ...(search ? targets : [])], passages),
  });
  return [
    task('forensics', ['pf_losers'], SEARCH_HEAVY, `${names} share price fall results news`, [...holdings, ...tables('Computed drawdown tables', blocks.pf_losers)], grounding.forensics),
    task('attribution', ['pf_health', 'pf_quality'], null, `portfolio ${names} profit concentration valuation`, [...holdings, ...tables('Computed health and attribution', blocks.pf_health), ...tables('Computed quality and valuation', blocks.pf_quality)], grounding.attribution),
    task('exposure', ['pf_factors', 'pf_scenarios'], SEARCH_LIGHT, `${names} RBI interest rate sector outlook regulation exports`, [...holdings, ...tables('Computed exposure', blocks.pf_factors), ...tables('Computed scenario range', blocks.pf_scenarios)], grounding.exposure),
    task('risks', ['pf_risks'], null, `${names} concentration risk`, [...holdings, ...tables('Computed risk register', blocks.pf_risks)], grounding.risks),
  ];
}

const SUMMARY_CHARS = 600;
const FINDINGS_CHARS = 1800;

/** A task with the chapters already written added to its prompt, so it reads their findings instead of guessing. */
export function withFindings(task: PortfolioTask, prose: Readonly<Partial<Record<PortfolioChapterId, string>>>): PortfolioTask {
  const found = (['pf_losers', 'pf_factors', 'pf_risks'] as const).flatMap((id) => (prose[id] ? [`### Findings already written: ${chapterMeta(id).title}\n${prose[id]!.replace(/\s+/g, ' ').slice(0, FINDINGS_CHARS)}`] : []));
  return found.length === 0 ? task : { ...task, prompt: `${task.prompt}\n\n${found.join('\n\n')}` };
}

/** The checklist call: no search, only a short summary of each chapter already written. */
export function buildChecklistTask(positions: readonly Position[], omitted: number, prose: Readonly<Partial<Record<PortfolioChapterId, string>>>): PortfolioTask {
  const summaries = (Object.entries(prose) as [PortfolioChapterId, string][]).map(([id, text]) => ({ heading: `Chapter summary: ${chapterMeta(id).title}`, body: text.replace(/\s+/g, ' ').slice(0, SUMMARY_CHARS) }));
  return { id: 'checklist', chapters: ['pf_checklist'], system: RESEARCH_PORTFOLIO_SYSTEM, search: null, groundingQuery: '', prompt: build(['pf_checklist'], [...holdingsFacts(positions, omitted), ...summaries], []) };
}
