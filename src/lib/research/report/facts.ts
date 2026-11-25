// The facts the model is given for the report's chapters (#360). Tables are the same ones the reader sees (as markdown), so the
// prose cannot disagree with the page. Text that comes from outside (the company description, exchange announcements,
// Screener's pros and cons) is sanitised and fenced as untrusted data.

import { untrusted, wrapUntrusted } from '@/lib/ai/untrusted';
import type { FactBlock } from '@/lib/ai/researchPrompts';
import { blocksToMarkdown } from '../blocksMarkdown';
import { toNumber } from '../formatters';
import type { ChapterId } from './chapters';
import type { ComputedReport } from './computed';
import type { ReportInputs } from './inputs';
import { riskSeeds } from './riskSeeds';

const ANNOUNCEMENTS_SHOWN = 25;
const ABOUT_CHARS = 900;

function ratioLine(name: string, value: string | null, unit: string | null): string {
  const n = toNumber(value);
  return `${name}: ${n === null ? '—' : n}${unit && unit !== 'x' ? ` ${unit.replace('INR_CR', '₹ crore')}` : unit === 'x' ? 'x' : ''}`;
}

export function profileFacts(inputs: ReportInputs): FactBlock[] {
  const { company } = inputs;
  const about = company.about ? wrapUntrusted([company.about], ABOUT_CHARS) : '';
  const ratios = (inputs.ratios ?? []).map((r) => ratioLine(r.name, r.value, r.unit));
  return [
    { heading: `${company.name} (${inputs.symbol}): profile`, body: [`Sector / industry: ${company.sector ?? '—'} / ${company.industry ?? '—'}`, about].filter(Boolean).join('\n') },
    ...(ratios.length > 0 ? [{ heading: 'Current ratios', body: ratios.join('; ') }] : []),
  ];
}

export function announcementFacts(inputs: ReportInputs): FactBlock[] {
  // Each outside field is sanitised on its own, before it is composed into a line: a role marker such as "assistant:" is only
  // recognised at the start of the text it is in.
  const rows = (inputs.announcements ?? [])
    .slice(0, ANNOUNCEMENTS_SHOWN)
    .map((a) => `${a.announced_on ?? 'undated'} | ${a.category} | ${untrusted(a.title, 200)}${a.summary ? ` | ${untrusted(a.summary, 300)}` : ''}`);
  const insights = (inputs.insights ?? []).map((i) => `${i.kind === 'pro' ? 'Pro' : 'Con'}: ${untrusted(i.text, 200)}`);
  return [
    ...(rows.length > 0 ? [{ heading: 'Recent exchange announcements (newest first: date | type | title | summary)', body: wrapUntrusted(rows, 300) }] : []),
    ...(insights.length > 0 ? [{ heading: 'Screener’s machine-generated pros and cons (flags to check, not analysis)', body: wrapUntrusted(insights, 200) }] : []),
  ];
}

/** The computed tables of the given chapters as facts, in markdown. */
export function chapterTables(computed: ComputedReport, ids: readonly ChapterId[]): FactBlock[] {
  return ids.flatMap((id) => {
    const markdown = blocksToMarkdown(computed.blocks[id]);
    return markdown ? [{ heading: `Computed figures for the ${id} chapter`, body: markdown }] : [];
  });
}

export function riskFacts(computed: ComputedReport, inputs: ReportInputs): FactBlock[] {
  const seeds = riskSeeds({ years: computed.years, pledge: computed.pledge, fiiChange: computed.fiiChange, announcements: inputs.announcements });
  return seeds.length === 0 ? [{ heading: 'Risk indicators computed from the figures', body: 'None of the standard indicators (leverage, interest cover, cash conversion, negative free cash flow, pledge, foreign selling, litigation notices) is triggered.' }] : [{ heading: 'Risk indicators computed from the figures', body: seeds.map((s) => `- ${s}`).join('\n') }];
}

/** One name for use in a search query, with no private details. */
export const searchName = (inputs: ReportInputs): string => `${untrusted(inputs.company.name, 80)} (NSE: ${inputs.symbol})`;
