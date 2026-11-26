// The structured extras of the head-to-head report (#394): the sector-specific measures as a table, a profile card per company and
// the issues as severity-tagged cards, read by one extra model call from the chapters already written. Anything the chapters do not
// support is not shown, a company the model names that is not in the comparison is dropped, and nothing here adds a fact.

import { z } from 'zod';
import { RESEARCH_COMPARE_STRUCTURE_SYSTEM } from '@/lib/ai/prompts';
import { recoverObject } from '@/lib/ai/jsonRecovery';
import { untrusted } from '@/lib/ai/untrusted';
import type { ResearchBlock, TableCell } from '../blocks';
import { chapterMeta, type CompareChapterId } from '../report/chapters';
import { stripMath } from '../report/plainText';
import type { CompareCompany } from './analysis';
import type { CompareTask } from './tasks';

const text = z.string().trim().max(400).default('');
const short = z.string().trim().max(120).default('');

export const structureSchema = z.object({
  sector_kpis: z.array(z.object({ measure: short, unit: short, values: z.array(z.object({ symbol: short, value: short })).max(4).default([]), leader: short })).max(6).default([]),
  profiles: z.array(z.object({ symbol: short, business: text, mix: text, moat: text, edge: short, lags: short })).max(4).default([]),
  issues: z.array(z.object({ symbol: short, severity: z.string().trim().default('NORMAL'), issue: text })).max(16).default([]),
});
export type Structure = z.infer<typeof structureSchema>;

const SUMMARY_CHARS = 2200;

/** The extraction call: no search, only the chapter texts. */
export function buildStructureTask(companies: readonly CompareCompany[], prose: Readonly<Partial<Record<CompareChapterId, string>>>): CompareTask {
  const wanted: CompareChapterId[] = ['cmp_matrix', 'cmp_profiles', 'cmp_issues'];
  const chapters = wanted.flatMap((id) => (prose[id] ? [`### ${chapterMeta(id).title} (${id})\n${prose[id]!.slice(0, SUMMARY_CHARS)}`] : []));
  return {
    id: 'structure',
    chapters: [],
    system: RESEARCH_COMPARE_STRUCTURE_SYSTEM,
    search: null,
    groundingQuery: '',
    prompt: `Companies (use exactly these symbols): ${companies.map((c) => `${c.symbol} = ${untrusted(c.name, 80)}`).join('; ')}.\n\n${chapters.join('\n\n')}`,
  };
}

export const parseStructure = (reply: string): Structure | null => recoverObject(reply, structureSchema);

const MISSING = /^(not stated|not found|n\/a|none|unknown|—|-)?$/i;
const clean = (value: string): string => stripMath(value).replace(/\s+/g, ' ').trim();
const clip = (value: string, max = 260): string => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
const SEVERITIES = ['CRITICAL', 'MODERATE', 'NORMAL'] as const;
type Severity = (typeof SEVERITIES)[number];
const severityOf = (raw: string): Severity => (SEVERITIES.find((s) => s === raw.trim().toUpperCase()) ?? 'NORMAL');

/** The blocks each chapter gains from the extraction. A part with too little to show is left out. */
export function structureBlocks(structure: Structure, companies: readonly CompareCompany[]): Partial<Record<CompareChapterId, ResearchBlock[]>> {
  const out: Partial<Record<CompareChapterId, ResearchBlock[]>> = {};
  const bySymbol = new Map(companies.map((c) => [c.symbol.toUpperCase(), c]));
  const known = (symbol: string): CompareCompany | undefined => bySymbol.get(symbol.trim().toUpperCase());
  const order = (symbol: string): number => companies.findIndex((c) => c.symbol === known(symbol)?.symbol);

  const kpis = structure.sector_kpis.filter((k) => clean(k.measure));
  if (kpis.length >= 1) {
    const rows: Record<string, TableCell>[] = kpis.map((k) => {
      const have = new Map(k.values.flatMap((v) => (known(v.symbol) ? [[known(v.symbol)!.symbol, clean(v.value)] as const] : [])));
      return { measure: clip(`${clean(k.measure)}${clean(k.unit) ? ` (${clean(k.unit)})` : ''}`, 80), ...Object.fromEntries(companies.map((c) => [c.symbol, MISSING.test(have.get(c.symbol) ?? '') ? 'not found' : clip(have.get(c.symbol)!, 90)])) };
    });
    const highlights = kpis.flatMap((k, row) => {
      const leader = known(k.leader);
      return leader && rows[row][leader.symbol] !== 'not found' ? [{ row, column: leader.symbol }] : [];
    });
    out.cmp_matrix = [
      {
        type: 'data_table',
        title: 'Sector measures',
        note: 'Found by search, with the sources listed under the chapter. "not found" means no source gave the figure; nothing is estimated.',
        columns: [{ key: 'measure', label: 'Measure', format: 'text' }, ...companies.map((c) => ({ key: c.symbol, label: c.symbol, format: 'text' as const }))],
        rows,
        highlights,
      },
    ];
  }

  const profiles = structure.profiles.filter((p) => known(p.symbol)).sort((a, b) => order(a.symbol) - order(b.symbol));
  if (profiles.length >= 2) {
    out.cmp_profiles = [
      {
        type: 'card_grid',
        title: 'What each company does',
        columns: 2,
        numbered: false,
        cards: profiles.map((p) => {
          const c = known(p.symbol)!;
          const edge = clean(p.edge);
          const part = (label: string, v: string): string => (MISSING.test(clean(v)) ? '' : `${label}: ${clean(v)}`);
          return {
            heading: c.name,
            text: clip([clean(p.business), part('Mix', p.mix), part('Moat', p.moat), part('Trails on', p.lags)].filter(Boolean).join(' · '), 420),
            ...(MISSING.test(edge) ? {} : { tag: `Edge: ${clip(edge, 60)}` }),
          };
        }),
      },
    ];
  }

  const rank: Record<Severity, number> = { CRITICAL: 0, MODERATE: 1, NORMAL: 2 };
  const issues = structure.issues
    .filter((i) => known(i.symbol) && clean(i.issue))
    .sort((a, b) => order(a.symbol) - order(b.symbol) || rank[severityOf(a.severity)] - rank[severityOf(b.severity)]);
  if (issues.length >= 2) {
    out.cmp_issues = [
      { type: 'card_grid', title: 'Issues by company', columns: 2, numbered: false, cards: issues.map((i) => ({ heading: known(i.symbol)!.name, text: clip(clean(i.issue)), tag: severityOf(i.severity) })) },
    ];
  }
  return out;
}
