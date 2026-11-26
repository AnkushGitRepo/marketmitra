// The user's notes as an A2UI v1.0 surface (#400): a header, then a row per note with its kind, tickers and date, a preview, and two
// buttons. Built here from the user's own notes, never by the model (it picks the tool, we pick every component and every word). The
// buttons send events the chat handles itself (open the note, ask Mitra about it); nothing in a note is ever a component. Pure.

import { askMitraPrompt } from '@/lib/notes/vault';
import type { NoteList } from '../notesList';
import { clip, column, divider, row, surfaceMessages, text, type A2uiMessage, type Component } from './kit';
import type { CardResult } from './analystCards';

export const NOTES_SURFACE_ID = 'notes-list';
export const OPEN_NOTE_EVENT = 'open_note';
export const ASK_NOTE_EVENT = 'ask_note';
const MAX_ROWS = 8;
const TITLE_CHARS = 90;
const PREVIEW_CHARS = 130;

/** A button that sends an event to the chat. Its label is a Text child. */
function button(id: string, label: string, event: string, context: Readonly<Record<string, string>>): Component[] {
  return [
    { id, component: 'Button', child: `${id}_t`, variant: 'default', action: { event: { name: event, context } } },
    text(`${id}_t`, label),
  ];
}

/** Null when there is nothing to show. */
export function buildNotesCard(list: NoteList): CardResult | null {
  if (list.notes.length === 0) return null;
  const shown = list.notes.slice(0, MAX_ROWS);
  const more = list.matched - shown.length;
  const heading = list.matched === list.total ? `Your notes (${list.total})` : `Your notes: ${list.matched} of ${list.total}`;

  const components: Component[] = [];
  const rows: string[] = [];
  shown.forEach((n, i) => {
    const id = `n${i}`;
    const meta = [n.kind, ...(n.tickers.length > 0 ? [n.tickers.slice(0, 4).join(', ')] : []), n.updated].join(' · ');
    components.push(
      column(id, [`${id}_title`, `${id}_meta`, ...(n.preview ? [`${id}_prev`] : []), `${id}_acts`]),
      text(`${id}_title`, clip(n.title, TITLE_CHARS)),
      text(`${id}_meta`, meta, 'caption'),
      ...(n.preview ? [text(`${id}_prev`, clip(n.preview, PREVIEW_CHARS), 'caption')] : []),
      row(`${id}_acts`, [`${id}_open`, `${id}_ask`]),
      ...button(`${id}_open`, 'Open', OPEN_NOTE_EVENT, { id: n.id }),
      ...button(`${id}_ask`, 'Ask Mitra about it', ASK_NOTE_EVENT, { title: n.title }),
    );
    rows.push(id);
    if (i < shown.length - 1) {
      components.push(divider(`${id}_div`));
      rows.push(`${id}_div`);
    }
  });
  components.unshift(
    column('root', ['head', 'head_div', ...rows, ...(more > 0 ? ['more'] : [])]),
    text('head', heading),
    divider('head_div'),
    ...(more > 0 ? [text('more', `${more} more match${more === 1 ? '' : 'es'}. Ask Mitra to narrow it by a ticker or a word.`, 'caption')] : []),
  );

  const summary = [
    `A card of ${shown.length} of the user's ${list.matched === list.total ? `${list.total} notes` : `${list.matched} matching notes (${list.total} in all)`} is already shown to the user, with Open and Ask Mitra buttons.`,
    ...list.notes.map((n) => `- ${n.title} (${n.kind}, ${n.tickers.join(', ') || 'no tickers'}, ${n.updated}, id ${n.id})`),
  ].join('\n');
  return { messages: surfaceMessages(NOTES_SURFACE_ID, components) as A2uiMessage[], summary };
}

export type NoteCardAction = { readonly type: 'open'; readonly href: string } | { readonly type: 'ask'; readonly text: string };

const NOTE_ID = /^[a-f0-9]{24}$/i;
const MAX_TITLE = 140;

/** What a button press on the notes card means for the chat, or null for anything that is not one of ours or is malformed. */
export function noteCardAction(name: string, context: Readonly<Record<string, unknown>>): NoteCardAction | null {
  if (name === OPEN_NOTE_EVENT) {
    const id = context.id;
    return typeof id === 'string' && NOTE_ID.test(id) ? { type: 'open', href: `/notes?note=${id}` } : null;
  }
  if (name === ASK_NOTE_EVENT) {
    const title = context.title;
    return typeof title === 'string' && title.trim() && title.length <= MAX_TITLE ? { type: 'ask', text: askMitraPrompt(title.trim()) } : null;
  }
  return null;
}
