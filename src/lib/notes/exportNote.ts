// A note as a file (#396): Markdown, plain text and Word, from the note's own markdown body. The PDF is the browser's print of the
// reader. Pure apart from the Word library, which is loaded only when a Word file is asked for.

import { proseText } from '@/lib/research/report/export/text';
import { noteTickers, type VaultNote } from './vault';

export type NoteFormat = 'pdf' | 'docx' | 'md' | 'txt';

export const NOTE_FORMATS: readonly { readonly id: NoteFormat; readonly label: string; readonly hint: string }[] = [
  { id: 'pdf', label: 'PDF', hint: 'Opens print: choose Save as PDF' },
  { id: 'docx', label: 'Word (.docx)', hint: 'Editable, with headings and tables' },
  { id: 'md', label: 'Markdown (.md)', hint: 'For Obsidian, Notion or Git' },
  { id: 'txt', label: 'Plain text (.txt)', hint: 'No formatting' },
];

type Exportable = Pick<VaultNote, 'title' | 'body' | 'symbol' | 'tickers' | 'source' | 'updatedAt'>;

const isoDate = (when: Date | string): string => new Date(when).toISOString().slice(0, 10);
const safe = (text: string): string => text.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const kind = (n: Exportable): string => (n.source === 'research' ? 'Saved research' : 'Note');

/** A file name without its extension: MarketMitra-note-Telecom-research-brief-2026-11-25. */
export const noteFileBase = (n: Exportable): string => `MarketMitra-note-${safe(n.title) || 'untitled'}-${isoDate(n.updatedAt)}`;

export function noteMarkdown(n: Exportable): string {
  const tickers = noteTickers(n);
  const front = ['---', `title: ${JSON.stringify(n.title)}`, `kind: ${n.source === 'research' ? 'saved research' : 'note'}`, `date: ${isoDate(n.updatedAt)}`, ...(tickers.length > 0 ? [`tickers: [${tickers.join(', ')}]`] : []), '---'].join('\n');
  return `${front}\n\n# ${n.title}\n\n${n.body.trim()}\n`;
}

export function noteText(n: Exportable): string {
  const tickers = noteTickers(n);
  const rule = '='.repeat(72);
  return [rule, n.title.toUpperCase(), `${kind(n)} | ${isoDate(n.updatedAt)}${tickers.length > 0 ? ` | ${tickers.join(', ')}` : ''}`, rule, '', proseText(n.body), ''].join('\n');
}

export async function noteDocx(n: Exportable): Promise<Blob> {
  const { noteDocxBlob } = await import('@/lib/research/report/export/docx');
  return noteDocxBlob({ title: n.title, body: n.body, tickers: noteTickers(n), byline: `${kind(n)}, ${isoDate(n.updatedAt)}` });
}
