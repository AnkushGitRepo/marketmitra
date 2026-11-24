// What Mitra is doing right now, and a tidy summary of the tools it used (#338). Pure helpers over a message's parts, so they test
// without mocks. The question, card and holding-card tools are not "activity": they have their own UI.

import { ASK_USER_TOOL } from './askUser';
import { HOLDING_PROPOSAL_TOOL } from './holdingProposal';

export type ActivityStage = 'thinking' | 'researching' | 'tool' | 'writing';

export interface PartLike {
  readonly type: string;
  readonly text?: string;
  readonly state?: string;
}

export interface ToolCall {
  readonly name: string;
  readonly label: string;
  readonly running: boolean;
  readonly failed: boolean;
}

export interface ToolGroup {
  readonly name: string;
  readonly label: string;
  readonly count: number;
  readonly running: boolean;
  readonly failed: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  search_context: 'Searched your knowledge base',
  run_screener: 'Ran the screener',
  get_screener_options: 'Checked screener options',
  call_platform_api: 'Read your platform data',
};

/** Tools that read outside data, so the user sees "looking things up" rather than a generic "working". */
const RESEARCH_TOOLS: ReadonlySet<string> = new Set([
  'search_context',
  'search_symbols',
  'get_quote',
  'get_company_fundamentals',
  'get_price_history',
  'get_news',
  'list_ipos',
  'get_ipo',
  'get_indices',
  'call_platform_api',
]);

/** What the live line says while this tool runs. */
const RUNNING_PHRASES: Record<string, string> = {
  search_context: 'Searching filings, news and your notes…',
  search_symbols: 'Finding the stock…',
  get_quote: 'Fetching the live quote…',
  get_company_fundamentals: 'Fetching fundamentals…',
  get_price_history: 'Reading the price history…',
  get_news: 'Reading the latest news…',
  list_ipos: 'Checking IPO data…',
  get_ipo: 'Checking IPO data…',
  call_platform_api: 'Looking at your portfolio data…',
  run_screener: 'Running the screener…',
};

const STAGE_TEXT: Record<Exclude<ActivityStage, 'tool' | 'researching'>, string> = {
  thinking: 'Thinking it through…',
  writing: 'Writing the answer…',
};

export function toolName(type: string): string {
  return type.replace(/^tool-/, '');
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

/** True for a tool part that belongs in the activity list (not a question, a card or a holding proposal). */
export function isActivityPart(type: string, isCard: (type: string) => boolean): boolean {
  if (!type.startsWith('tool-')) return false;
  const name = toolName(type);
  return name !== ASK_USER_TOOL && name !== HOLDING_PROPOSAL_TOOL && !isCard(type);
}

const finished = (state: string | undefined) => state === 'output-available' || state === 'output-error';

export function toolCalls(parts: readonly PartLike[], isCard: (type: string) => boolean): ToolCall[] {
  return parts
    .filter((p) => isActivityPart(p.type, isCard))
    .map((p) => ({ name: toolName(p.type), label: toolLabel(toolName(p.type)), running: !finished(p.state), failed: p.state === 'output-error' }));
}

/** The same tool called several times becomes one row with a count; order follows first use. */
export function groupCalls(calls: readonly ToolCall[]): ToolGroup[] {
  const groups = new Map<string, ToolGroup>();
  for (const c of calls) {
    const prev = groups.get(c.name);
    groups.set(c.name, {
      name: c.name,
      label: c.label,
      count: (prev?.count ?? 0) + 1,
      running: (prev?.running ?? false) || c.running,
      failed: (prev?.failed ?? false) || c.failed,
    });
  }
  return [...groups.values()];
}

/** "Used 6 tools", or "Used 1 tool". */
export function summaryText(calls: readonly ToolCall[]): string {
  return `Used ${calls.length} tool${calls.length === 1 ? '' : 's'}`;
}

/** The stage of a reply that is still streaming: what the user should see Mitra doing. */
export function stageOf(parts: readonly PartLike[], isCard: (type: string) => boolean): ActivityStage {
  const calls = toolCalls(parts, isCard);
  const running = calls.filter((c) => c.running).at(-1);
  if (running) return RESEARCH_TOOLS.has(running.name) ? 'researching' : 'tool';
  const hasText = parts.some((p) => p.type === 'text' && (p.text ?? '').length > 0);
  return hasText ? 'writing' : 'thinking';
}

/** The one line shown beside the avatar while Mitra works. */
export function stageText(stage: ActivityStage, parts: readonly PartLike[], isCard: (type: string) => boolean): string {
  if (stage === 'thinking' || stage === 'writing') return STAGE_TEXT[stage];
  const running = toolCalls(parts, isCard).filter((c) => c.running).at(-1);
  return (running && RUNNING_PHRASES[running.name]) ?? (running ? `${running.label}…` : STAGE_TEXT.thinking);
}
