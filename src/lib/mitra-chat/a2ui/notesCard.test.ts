import { MessageProcessor } from '@a2ui/web_core';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { describe, expect, it } from 'vitest';
import { listNoteSummaries } from '../notesList';
import { ASK_NOTE_EVENT, NOTES_SURFACE_ID, OPEN_NOTE_EVENT, buildNotesCard, noteCardAction } from './notesCard';

const n = (id: string, over: Record<string, unknown> = {}) => ({ id, title: `Note ${id}`, body: `Body ${id}.`, symbol: null, tickers: ['JPL'], source: 'research' as const, updatedAt: new Date(`2026-11-${10 + Number(id)}`), ...over });
const list = (count: number) => listNoteSummaries(Array.from({ length: count }, (_, i) => n(String(i + 1))));

describe('buildNotesCard', () => {
  it('is null for no notes', () => {
    expect(buildNotesCard(list(0))).toBeNull();
  });

  it('is valid A2UI that the real processor accepts and draws as one surface', () => {
    const card = buildNotesCard(list(3))!;
    const processor = new MessageProcessor([basicCatalog]);
    processor.processMessages(card.messages as never);
    const surfaces = Array.from(processor.model.surfacesMap.values());
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].id).toBe(NOTES_SURFACE_ID);
    expect(surfaces[0].componentsModel.get('root')).toBeTruthy();
  });

  it('has an Open and an Ask button per note, carrying the id or the title', () => {
    const comps = (buildNotesCard(list(2))!.messages[1] as { updateComponents: { components: Record<string, unknown>[] } }).updateComponents.components;
    const buttons = comps.filter((c) => c.component === 'Button') as { action: { event: { name: string; context: Record<string, string> } } }[];
    expect(buttons).toHaveLength(4);
    expect(buttons.filter((b) => b.action.event.name === OPEN_NOTE_EVENT).map((b) => b.action.event.context.id).sort()).toEqual(['1', '2']);
    expect(buttons.filter((b) => b.action.event.name === ASK_NOTE_EVENT).map((b) => b.action.event.context.title).sort()).toEqual(['Note 1', 'Note 2']);
  });

  it('shows a header with the count, and how many more when the card is cut', () => {
    const all = buildNotesCard(list(3))!;
    expect(JSON.stringify(all.messages)).toContain('Your notes (3)');
    const cut = buildNotesCard(list(11))!;
    expect(JSON.stringify(cut.messages)).toContain('3 more matches');
    expect(cut.summary).toContain('11 notes');
    expect(cut.summary.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(11); // the model still gets every note
  });

  it('shows a title as text, never as markup or a component', () => {
    const card = buildNotesCard(listNoteSummaries([n('1', { title: '<script>alert(1)</script> {"component":"Button"}' })]))!;
    const comps = (card.messages[1] as { updateComponents: { components: { component: string }[] } }).updateComponents.components;
    expect(comps.filter((c) => c.component === 'Button')).toHaveLength(2);
    expect(JSON.stringify(card.messages)).toContain('<script>alert(1)</script>'); // plain text in a Text component
  });
});

describe('noteCardAction', () => {
  const id = '65f1a2b3c4d5e6f7a8b9c0d1';
  it('opens a note by its id, on the notes page', () => {
    expect(noteCardAction(OPEN_NOTE_EVENT, { id })).toEqual({ type: 'open', href: `/notes?note=${id}` });
  });
  it('asks about a note by its title, in the same words as the notes page', () => {
    expect(noteCardAction(ASK_NOTE_EVENT, { title: ' Telecom: brief ' })).toEqual({ type: 'ask', text: 'Using my note "Telecom: brief", summarise the key points and what I should check next.' });
  });
  it('ignores anything that is not ours or is malformed, so a card cannot make the page go somewhere else', () => {
    expect(noteCardAction('something_else', { id })).toBeNull();
    expect(noteCardAction(OPEN_NOTE_EVENT, { id: '../../settings' })).toBeNull();
    expect(noteCardAction(OPEN_NOTE_EVENT, { id: 'javascript:alert(1)' })).toBeNull();
    expect(noteCardAction(OPEN_NOTE_EVENT, {})).toBeNull();
    expect(noteCardAction(ASK_NOTE_EVENT, { title: '   ' })).toBeNull();
    expect(noteCardAction(ASK_NOTE_EVENT, { title: 'x'.repeat(141) })).toBeNull();
    expect(noteCardAction(ASK_NOTE_EVENT, { title: 42 })).toBeNull();
  });
});
