// The model calls that write the report's chapters (#360, ADR 0081): what each one is asked, and how its reply is read.

import { RESEARCH_CHAPTER_SYSTEM, RESEARCH_RISK_SYSTEM } from '@/lib/ai/prompts';
import type { FactBlock } from '@/lib/ai/researchPrompts';
import { recoverObject } from '@/lib/ai/jsonRecovery';
import type { GroundingPassage } from '@/lib/rag/insightContext';
import type { SearchBudget } from '@/lib/ai/research/webTools';
import { chapterMeta, type ChapterId, type CompanyChapterId } from './chapters';
import type { ComputedReport } from './computed';
import { announcementFacts, chapterTables, profileFacts, riskFacts, searchName } from './facts';
import type { ReportInputs } from './inputs';
import { stripMath } from './plainText';
import { riskRegisterSchema, type RiskItem } from './riskBlocks';

export type TaskId = 'business' | 'numbers' | 'sector' | 'legal' | 'risks';

export interface TaskSpec {
  readonly id: TaskId;
  readonly chapters: readonly ChapterId[];
  readonly system: string;
  readonly prompt: string;
  /** Null: the call does not search the web (the facts are all it needs). */
  readonly search: SearchBudget | null;
  /** What retrieval should look for in the indexed news, filings and notes for this call. */
  readonly groundingQuery: string;
}

const GUIDANCE: Record<CompanyChapterId, string> = {
  overview:
    'What the business does and how it makes money: revenue drivers and, if the annual report or a source gives them, segments and unit economics (realisation, utilisation, customers). Its competitive position and how durable the moat looks. End with the 3 to 4 points the investment case turns on, stated neutrally.',
  management:
    'Leadership and promoter track record, how well past guidance was delivered, and capital allocation judged from ROCE and ROE, capex against operating cash flow, dividends and leverage. Read the ownership table: promoter, foreign and domestic institutional holding and how they moved, and the pledge. Say what you could and could not find.',
  financials:
    'Interpret the five-year trajectory: sales growth, margin drivers, profit quality, how much profit became operating and free cash flow, leverage and interest cover, and working-capital days. Explain what changed between years and why it matters.',
  peers:
    'Benchmark against the listed peers in the table: who leads on scale, margins, ROCE, growth and leverage, and where this company wins or lags. Say what each notable peer does differently if you know it from a source.',
  valuation:
    'Where valuation sits against the company’s own history and its peers (P/E, EV/EBITDA, price to book) and what that implies about expectations. Explain the bear, base and bull illustration as a range drawn from the company’s own history, never a forecast or a target.',
  sector:
    'The industry: size and growth, structure (consolidated or fragmented), cyclicality, pricing power, and the structural tailwinds and headwinds, with dated sources.',
  regulatory:
    'The regulators and rules that shape the business (for example SEBI, RBI, TRAI and DoT, sector ministries, tariffs, PLI schemes, environmental clearances), what changed recently and what decisions are due.',
  legal:
    'Active litigation and disputes, tax and regulatory demands, penalties, auditor and governance matters. Start from the exchange announcements and the promoter pledge in the facts, then search for anything they point to. Give each matter with its forum, amount and date where known.',
  risks: 'The risk register.',
};

const chapterList = (ids: readonly CompanyChapterId[]): string =>
  ids.map((id) => `## CHAPTER: ${id}\n(${chapterMeta(id).title}) ${GUIDANCE[id]}`).join('\n\n');

const factsText = (blocks: readonly FactBlock[]): string => blocks.map((b) => `### ${b.heading}\n${b.body.trim()}`).join('\n\n');

const groundingText = (passages: readonly GroundingPassage[]): string =>
  passages.length === 0 ? 'Retrieved context: none was found in the indexed news, filings or notes.' : `Retrieved context (indexed news, filings and notes):\n${passages.map((p) => `- (${p.source}) ${p.text}`).join('\n')}`;

function prompt(inputs: ReportInputs, ids: readonly CompanyChapterId[], facts: readonly FactBlock[], passages: readonly GroundingPassage[], extra = ''): string {
  return [
    `Subject: ${searchName(inputs)}.`,
    `Write these chapters, in this order, each under its "## CHAPTER: <id>" line:\n\n${chapterList(ids)}`,
    extra,
    factsText(facts),
    groundingText(passages),
  ].filter(Boolean).join('\n\n');
}

export const SEARCH_LIGHT: SearchBudget = { maxSearches: 3, maxPages: 2 };
export const SEARCH_HEAVY: SearchBudget = { maxSearches: 6, maxPages: 4 };

export function buildTasks(inputs: ReportInputs, computed: ComputedReport, grounding: Readonly<Record<Exclude<TaskId, 'risks'>, readonly GroundingPassage[]>>): TaskSpec[] {
  const name = inputs.company.name;
  const profile = profileFacts(inputs);
  const announcements = announcementFacts(inputs);
  return [
    {
      id: 'business',
      chapters: ['overview', 'management'],
      system: RESEARCH_CHAPTER_SYSTEM,
      search: SEARCH_LIGHT,
      groundingQuery: `${name} business segments revenue model competitive position management promoters capital allocation`,
      prompt: prompt(inputs, ['overview', 'management'], [...profile, ...chapterTables(computed, ['overview', 'management']), ...announcements], grounding.business),
    },
    {
      id: 'numbers',
      chapters: ['financials', 'peers', 'valuation'],
      system: RESEARCH_CHAPTER_SYSTEM,
      search: null,
      groundingQuery: `${name} results margins cash flow debt valuation`,
      prompt: prompt(inputs, ['financials', 'peers', 'valuation'], [...profile, ...chapterTables(computed, ['financials', 'peers', 'valuation'])], grounding.numbers),
    },
    {
      id: 'sector',
      chapters: ['sector'],
      system: RESEARCH_CHAPTER_SYSTEM,
      search: SEARCH_HEAVY,
      groundingQuery: `${inputs.company.sector ?? name} sector outlook industry demand pricing tailwinds headwinds`,
      prompt: prompt(inputs, ['sector'], [...profile, ...chapterTables(computed, ['peers'])], grounding.sector, `Sector: ${inputs.company.sector ?? 'unknown'}; industry: ${inputs.company.industry ?? 'unknown'}.`),
    },
    {
      id: 'legal',
      chapters: ['regulatory', 'legal'],
      system: RESEARCH_CHAPTER_SYSTEM,
      search: SEARCH_HEAVY,
      groundingQuery: `${name} regulator order penalty litigation tribunal court tax demand SEBI RBI`,
      prompt: prompt(inputs, ['regulatory', 'legal'], [...profile, ...chapterTables(computed, ['legal', 'management']), ...announcements], grounding.legal),
    },
  ];
}

const SUMMARY_CHARS = 700;

/** The risk register call: the computed indicators plus a short summary of each chapter already written. */
export function buildRisksTask(inputs: ReportInputs, computed: ComputedReport, prose: Readonly<Partial<Record<ChapterId, string>>>): TaskSpec {
  const summaries = (Object.entries(prose) as [ChapterId, string][]).map(([id, text]) => ({ heading: `Chapter summary: ${chapterMeta(id).title}`, body: text.replace(/\s+/g, ' ').slice(0, SUMMARY_CHARS) }));
  return {
    id: 'risks',
    chapters: ['risks'],
    system: RESEARCH_RISK_SYSTEM,
    search: null,
    groundingQuery: '',
    prompt: [`Subject: ${searchName(inputs)}.`, factsText([...profileFacts(inputs), ...riskFacts(computed, inputs), ...summaries])].join('\n\n'),
  };
}

const DISCLAIMER = /\s*This is a synthesis of public data, not investment advice\.?\s*$/i;
const MARKER = /^\s{0,3}#{1,4}\s*CHAPTER\s*:\s*([a-z_]+)\s*$/im;

/** The text of each requested chapter from one reply. A reply with no markers and a single chapter requested is that chapter. */
export function parseChapterText(reply: string, ids: readonly ChapterId[]): Partial<Record<ChapterId, string>> {
  const text = reply.replace(DISCLAIMER, '').trim();
  const lines = text.split('\n');
  const found: Partial<Record<ChapterId, string[]>> = {};
  let current: ChapterId | null = null;
  for (const line of lines) {
    const marker = MARKER.exec(line);
    if (marker) {
      const id = marker[1].toLowerCase() as ChapterId;
      current = ids.includes(id) ? id : null;
      if (current) found[current] = [];
      continue;
    }
    if (current) found[current]?.push(line);
  }
  const out: Partial<Record<ChapterId, string>> = {};
  for (const id of ids) {
    const body = stripMath(found[id]?.join('\n') ?? '').trim();
    if (body) out[id] = body;
  }
  if (Object.keys(out).length === 0 && ids.length === 1 && text.length > 0 && !MARKER.test(text)) out[ids[0]] = stripMath(text);
  return out;
}

/** The risk register from the model's JSON reply (also read from a fenced or surrounded reply), or null. */
export function parseRisks(reply: string): RiskItem[] | null {
  return recoverObject(reply, riskRegisterSchema)?.risks ?? null;
}
