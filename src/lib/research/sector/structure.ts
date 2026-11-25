// The structured extras of the sector report (#386): a value-chain strip, an India-versus-global table and callout cards of
// key points, read by one extra model call from the chapters already written; and the checklist as numbered cards, read from
// its text with no model. Anything the chapters do not support is simply not shown, and nothing here adds a fact.

import { z } from 'zod';
import { RESEARCH_SECTOR_STRUCTURE_SYSTEM } from '@/lib/ai/prompts';
import { recoverObject } from '@/lib/ai/jsonRecovery';
import type { ResearchBlock } from '../blocks';
import { chapterMeta, type SectorChapterId } from '../report/chapters';
import { stripMath } from '../report/plainText';
import type { SectorInputs } from './inputs';
import type { SectorTask } from './tasks';
import { untrusted } from '@/lib/ai/untrusted';

const text = z.string().trim().max(300).default('');
const points = z.array(text).max(8).default([]);

export const structureSchema = z.object({
  value_chain: z.array(z.object({ layer: text, role: text, margin: text, moat: text, leaders: text })).max(6).default([]),
  catalysts: points,
  policy_watch: points,
  red_flags: points,
  global_comparison: z.array(z.object({ company: text, scale: text, unit_economics: text, valuation: text, rd: text })).max(8).default([]),
});
export type Structure = z.infer<typeof structureSchema>;

const SUMMARY_CHARS = 1800;
const MIN_ITEMS = 1;

/** The extraction call: no search, only the chapter texts. */
export function buildStructureTask(inputs: SectorInputs, prose: Readonly<Partial<Record<SectorChapterId, string>>>): SectorTask {
  const wanted: SectorChapterId[] = ['sx_overview', 'sx_global', 'sx_outlook', 'sx_policy', 'sx_risks'];
  const chapters = wanted.flatMap((id) => (prose[id] ? [`### ${chapterMeta(id).title} (${id})\n${prose[id]!.slice(0, SUMMARY_CHARS)}`] : []));
  return {
    id: 'structure',
    chapters: [],
    system: RESEARCH_SECTOR_STRUCTURE_SYSTEM,
    search: null,
    groundingQuery: '',
    prompt: `Sector: ${untrusted(inputs.label, 80)}.\n\n${chapters.join('\n\n')}`,
  };
}

export const parseStructure = (reply: string): Structure | null => recoverObject(reply, structureSchema);

const MISSING = /^(not stated|not found|n\/a|none|unknown|—|-)?$/i;
const clean = (value: string): string => stripMath(value).replace(/\s+/g, ' ').trim();
const clip = (value: string, max = 240): string => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
const items = (list: readonly string[]): string[] => list.map(clean).filter((v) => v.length > 0).map((v) => clip(v));

/** The blocks each chapter gains from the extraction. A part with too little to show is left out. */
export function structureBlocks(structure: Structure): Partial<Record<SectorChapterId, ResearchBlock[]>> {
  const out: Partial<Record<SectorChapterId, ResearchBlock[]>> = {};

  const stages = structure.value_chain.map((s) => ({ ...s, layer: clean(s.layer) })).filter((s) => s.layer);
  if (stages.length >= 2) {
    out.sx_overview = [
      {
        type: 'card_grid',
        title: 'The value chain',
        columns: 4,
        numbered: false,
        cards: stages.map((s) => {
          const margin = clean(s.margin);
          const moat = clean(s.moat);
          const tag = [!MISSING.test(margin) ? `Margin: ${margin}` : '', !MISSING.test(moat) ? `Moat: ${moat}` : ''].filter(Boolean).join(' · ');
          const leaders = clean(s.leaders);
          return { heading: s.layer, text: clip([clean(s.role), leaders ? `Listed: ${leaders}.` : ''].filter(Boolean).join(' ')), ...(tag ? { tag } : {}) };
        }),
      },
    ];
  }

  const rows = structure.global_comparison.filter((r) => clean(r.company));
  if (rows.length >= 2) {
    const cell = (v: string): string => (MISSING.test(clean(v)) ? 'not found' : clip(clean(v), 120));
    out.sx_global = [
      {
        type: 'data_table',
        title: 'India versus global leaders',
        note: 'Only figures the chapter found in a source; "not found" means none was found.',
        columns: [
          { key: 'company', label: 'Company', format: 'text' },
          { key: 'scale', label: 'Scale', format: 'text' },
          { key: 'unit', label: 'Unit economics', format: 'text' },
          { key: 'valuation', label: 'Valuation', format: 'text' },
          { key: 'rd', label: 'R&D / technology', format: 'text' },
        ],
        rows: rows.map((r) => ({ company: clean(r.company), scale: cell(r.scale), unit: cell(r.unit_economics), valuation: cell(r.valuation), rd: cell(r.rd) })),
      },
    ];
  }

  const callout = (id: SectorChapterId, title: string, tone: 'positive' | 'watch' | 'risk', list: readonly string[]): void => {
    const kept = items(list);
    if (kept.length >= MIN_ITEMS) out[id] = [{ type: 'thesis_bento', columns: [{ title, tone, items: kept }] }];
  };
  callout('sx_outlook', 'Growth catalysts', 'positive', structure.catalysts);
  callout('sx_policy', 'Policy and regulatory watch-items', 'watch', structure.policy_watch);
  callout('sx_risks', 'Litigation and statutory red flags', 'risk', structure.red_flags);
  return out;
}

const ITEM = /^\s*\d+[.)]\s+(.*\S)\s*$/;
const MIN_QUESTIONS = 5;

/** The checklist text ("1. **Question?** - what to look for") as numbered cards; null unless it holds at least five items. */
export function checklistCards(markdown: string): ResearchBlock | null {
  const cards = markdown.split('\n').flatMap((line) => {
    const item = ITEM.exec(line);
    if (!item) return [];
    const body = item[1];
    const bold = /^\*\*(.+?)\*\*[\s:–—-]*(.*)$/.exec(body);
    if (bold) return [{ heading: bold[1].trim(), text: bold[2].trim() }];
    const q = body.indexOf('?');
    return q > 0 && q < body.length - 1 ? [{ heading: body.slice(0, q + 1).trim(), text: body.slice(q + 1).replace(/^[\s:–—-]+/, '').trim() }] : [{ heading: body, text: '' }];
  });
  return cards.length >= MIN_QUESTIONS ? { type: 'card_grid', title: 'Questions to answer before investing', columns: 2, numbered: true, cards } : null;
}
