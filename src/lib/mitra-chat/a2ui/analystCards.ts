// Analyst Desk cards as A2UI v1.0 surfaces (#329, ADR 0078): one analyst, or the whole desk for the Root Agent. Built here from the stored
// dossier and journal, never by the model. Dossier and journal text is model output shaped by external headlines, so it is clipped and only
// ever placed in plain-text components. Pure, so it tests without mocks.

import type { AnalystStatus, Dossier, JournalEntry } from '@/lib/analysts/types';
import { UNAVAILABLE, clip, column, divider, row, surfaceMessages, text, type A2uiMessage, type Component } from './kit';

export const ANALYST_SURFACE_ID = 'analyst-card';
export const DESK_SURFACE_ID = 'desk-overview';
const MAX_PILLARS = 3;
const MAX_NOTES = 3;
const MAX_DESK_ROWS = 8;
const SUMMARY_MAX = 280;
const PILLAR_MAX = 200;
const NOTE_MAX = 140;

export interface CardResult {
  /** What the chat renders. */
  readonly messages: readonly A2uiMessage[];
  /** What the model reads instead of the layout. */
  readonly summary: string;
}

const STATUS_LABEL: Readonly<Record<AnalystStatus, string>> = { initializing: 'Initializing', active: 'Active', paused: 'Paused', error: 'Error' };
const IMPACT_LABEL: Readonly<Record<'positive' | 'neutral' | 'negative', string>> = { positive: 'Positive', neutral: 'Neutral', negative: 'Negative' };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-10T10:00:00Z" → "10 Nov 2026"; anything unreadable → "n/a". */
function day(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return UNAVAILABLE;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${Number(m[3])} ${month} ${m[1]}` : UNAVAILABLE;
}

const ALREADY_SHOWN = 'A card was already shown to the user; do not repeat its text line by line, answer their question from it.';

export interface AnalystCardInput {
  readonly symbol: string;
  readonly status: AnalystStatus;
  readonly statusNote: string | null;
  readonly dossier: Dossier | null;
  readonly journal: readonly JournalEntry[];
}

export function buildAnalystCard(input: AnalystCardInput): CardResult {
  const { symbol, status, dossier } = input;
  const title = `${symbol} analyst · ${STATUS_LABEL[status]}`;
  const risks = (dossier?.vulnerabilities ?? []).slice(0, MAX_PILLARS);
  const strengths = (dossier?.strengths ?? []).slice(0, MAX_PILLARS);
  const notes = input.journal.slice(0, MAX_NOTES);
  const pillar = (p: { title: string; text: string }) => clip(`${p.title}: ${p.text}`, PILLAR_MAX);

  const noteRows = notes.flatMap((e, i): Component[] => [
    row(`n${i}`, [`n${i}_d`, `n${i}_t`, `n${i}_i`]),
    text(`n${i}_d`, day(e.ts), 'caption', 1),
    text(`n${i}_t`, clip(e.title, NOTE_MAX), 'body', 3),
    text(`n${i}_i`, e.impact ? IMPACT_LABEL[e.impact] : '', 'caption', 1),
  ]);

  const components: Component[] = [
    { id: 'root', component: 'Card', child: 'body' },
    column('body', [
      'title',
      ...(input.statusNote ? ['note'] : []),
      'summary',
      ...(strengths.length > 0 ? ['d1', 'str_t', ...strengths.map((_, i) => `s${i}`)] : []),
      ...(risks.length > 0 ? ['d2', 'risk_t', ...risks.map((_, i) => `r${i}`)] : []),
      ...(notes.length > 0 ? ['d3', 'notes_t', ...notes.map((_, i) => `n${i}`)] : []),
    ]),
    text('title', title),
    ...(input.statusNote ? [text('note', clip(input.statusNote, NOTE_MAX), 'caption')] : []),
    text('summary', dossier ? clip(dossier.summary, SUMMARY_MAX) : 'No dossier yet: the analyst has not finished its first pass.'),
    ...(strengths.length > 0 ? [divider('d1'), text('str_t', 'Strengths', 'caption'), ...strengths.map((p, i) => text(`s${i}`, pillar(p)))] : []),
    ...(risks.length > 0 ? [divider('d2'), text('risk_t', 'Open risks', 'caption'), ...risks.map((p, i) => text(`r${i}`, pillar(p)))] : []),
    ...(notes.length > 0 ? [divider('d3'), text('notes_t', 'Latest notes', 'caption'), ...noteRows] : []),
  ];

  const summary = [
    ALREADY_SHOWN,
    `${title}.`,
    dossier ? `Summary: ${clip(dossier.summary, SUMMARY_MAX)}` : 'There is no dossier yet.',
    ...risks.map((p) => `Open risk, ${pillar(p)}`),
    ...notes.map((e) => `${day(e.ts)} ${e.kind}: ${clip(e.title, NOTE_MAX)}${e.impact ? ` (${IMPACT_LABEL[e.impact]})` : ''}`),
  ].join('\n');

  return { messages: surfaceMessages(ANALYST_SURFACE_ID, components), summary };
}

export interface DeskView {
  readonly symbol: string;
  readonly status: AnalystStatus;
  readonly summary: string | null;
  readonly latest: JournalEntry | null;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The whole desk for the Root Agent. Null when there are no analysts. */
export function buildDeskOverview(views: readonly DeskView[]): CardResult | null {
  if (views.length === 0) return null;

  const counts = (['active', 'paused', 'initializing', 'error'] as const)
    .map((s) => [s, views.filter((v) => v.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(' · ');
  const shown = views.slice(0, MAX_DESK_ROWS);
  const hidden = views.length - shown.length;
  const title = `Analyst desk · ${plural(views.length, 'analyst', 'analysts')}`;

  const rowFor = (v: DeskView, i: number): Component[] => [
    column(`a${i}`, [`a${i}_h`, `a${i}_n`]),
    row(`a${i}_h`, [`a${i}_s`, `a${i}_st`, `a${i}_d`]),
    text(`a${i}_s`, v.symbol, 'body', 2),
    text(`a${i}_st`, STATUS_LABEL[v.status], 'caption', 1),
    text(`a${i}_d`, v.latest ? day(v.latest.ts) : '', 'caption', 1),
    text(`a${i}_n`, v.latest ? clip(v.latest.title, NOTE_MAX) : 'No notes yet', 'caption'),
  ];

  const components: Component[] = [
    { id: 'root', component: 'Card', child: 'body' },
    column('body', ['title', 'counts', 'd1', ...shown.map((_, i) => `a${i}`), ...(hidden > 0 ? ['more'] : [])]),
    text('title', title),
    text('counts', counts, 'caption'),
    divider('d1'),
    ...shown.flatMap(rowFor),
    ...(hidden > 0 ? [text('more', `+ ${plural(hidden, 'more analyst', 'more analysts')}`, 'caption')] : []),
  ];

  const summary = [
    ALREADY_SHOWN,
    `${title} (${counts}).`,
    ...shown.map((v) => `${v.symbol} (${STATUS_LABEL[v.status]}): ${v.latest ? `${day(v.latest.ts)} ${clip(v.latest.title, NOTE_MAX)}` : 'no notes yet'}`),
    ...(hidden > 0 ? [`${plural(hidden, 'more analyst', 'more analysts')} not shown.`] : []),
  ].join('\n');

  return { messages: surfaceMessages(DESK_SURFACE_ID, components), summary };
}
