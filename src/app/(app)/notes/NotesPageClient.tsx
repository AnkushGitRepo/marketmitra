'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { InfoPopover } from '@/components/common/InfoPopover';
import { EMPTY_DRAFT, NoteEditor, type NoteDraft } from '@/components/notes/NoteEditor';
import { NoteList } from '@/components/notes/NoteList';
import { NoteReader } from '@/components/notes/NoteReader';
import { download } from '@/components/research/report/exportReport';
import { noteDocx, noteFileBase, noteMarkdown, noteText, type NoteFormat } from '@/lib/notes/exportNote';
import type { TagChange } from '@/lib/notes/tags';
import vault from '@/components/notes/NotesVault.module.css';
import type { UserNote } from '@/lib/notes/userNotes';
import { NOTE_FILTERS, filterCounts, filterNotes, type NoteFilter } from '@/lib/notes/vault';
import styles from './page.module.css';

interface Props {
  notes: UserNote[];
  /** A note to open straight away (from a link), if it exists. */
  initialId?: string | null;
}

type Mode = { kind: 'read' } | { kind: 'edit'; draft: NoteDraft };

const draftOf = (n: UserNote): NoteDraft => ({
  id: n.id,
  title: n.title,
  body: n.body,
  symbol: n.symbol ?? '',
  tickers: n.tickers,
  source: n.source,
});

export function NotesPageClient({ notes, initialId = null }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? notes[0]?.id ?? null);
  // Arriving on a note from a link shows it, on a phone too.
  const [showReader, setShowReader] = useState(initialId !== null);
  const [mode, setMode] = useState<Mode>({ kind: 'read' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The note a delete is waiting on (from the toolbar or the list), until it is confirmed or cancelled. */
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [listHidden, setListHidden] = useState(false);
  const [now] = useState(() => new Date());

  const visible = useMemo(() => filterNotes(notes, filter, query), [notes, filter, query]);
  const counts = useMemo(() => filterCounts(notes), [notes]);
  // Show the chosen note, or the first one in view when the choice is filtered out or gone.
  const selected = visible.find((n) => n.id === selectedId) ?? visible[0] ?? null;
  const editing = mode.kind === 'edit' ? mode.draft : null;

  const select = (id: string) => {
    setSelectedId(id);
    setShowReader(true);
    setMode({ kind: 'read' });
    setError(null);
  };

  const startNew = () => {
    setError(null);
    setShowReader(true);
    setMode({ kind: 'edit', draft: EMPTY_DRAFT });
  };

  const save = async (draft: NoteDraft) => {
    if (!draft.title.trim() || !draft.body.trim()) {
      setError('Title and body are both required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/notes/${draft.id}` : '/api/notes', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          body: draft.body.trim(),
          symbol: draft.symbol.trim() || null,
          tickers: draft.tickers,
        }),
      });
      const data = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? 'Could not save the note.');
        return;
      }
      if (data?.data?.id) setSelectedId(data.data.id);
      setMode({ kind: 'read' });
      router.refresh();
    } catch {
      setError('Could not save the note. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const toDelete = notes.find((n) => n.id === deleteId) ?? null;

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${toDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        if (toDelete.id === selected?.id) {
          setSelectedId(null);
          setShowReader(false);
        }
        router.refresh();
      } else {
        setError('Could not delete the note.');
      }
    } catch {
      setError('Could not delete the note. Check your connection and try again.');
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  };

  /** Saves a note's new symbol and tickers (the title and body stay as they are); an error message when it could not. */
  const saveTags = async (change: Extract<TagChange, { ok: true }>): Promise<string | null> => {
    if (!selected) return 'Select a note first.';
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: selected.title, body: selected.body, symbol: change.symbol, tickers: change.tickers }),
      });
      if (!res.ok) return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save the tags.';
      router.refresh();
      return null;
    } catch {
      return 'Could not save the tags. Check your connection and try again.';
    } finally {
      setBusy(false);
    }
  };

  const exportFile = async (format: Exclude<NoteFormat, 'pdf'>): Promise<void> => {
    if (!selected) return;
    const base = noteFileBase(selected);
    if (format === 'docx') download(await noteDocx(selected), `${base}.docx`);
    else if (format === 'md') download(new Blob([noteMarkdown(selected)], { type: 'text/markdown;charset=utf-8' }), `${base}.md`);
    else download(new Blob([noteText(selected)], { type: 'text/plain;charset=utf-8' }), `${base}.txt`);
  };

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Notes</p>
          <div className={styles.titleRow}>
            <h1 className={styles.h1}>Research notes</h1>
            <InfoPopover label="About research notes">
              <p>
                Private notes on your holdings, sectors, or ideas, including research briefs you save from the Research
                page. Mitra and the AI insight cards search these alongside indexed news and filings, so a note on why you
                hold a stock informs what they tell you about it.
              </p>
            </InfoPopover>
          </div>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={startNew} disabled={editing !== null}>
          New note
        </button>
      </div>

      {notes.length > 0 && (
        <div className={styles.toolbar}>
          <div className={styles.pills} role="group" aria-label="Filter notes">
            {NOTE_FILTERS.map((f) => (
              <button key={f.id} type="button" className={styles.pill} data-active={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label} <span className={styles.pillCount}>{counts[f.id]}</span>
              </button>
            ))}
          </div>
          <input
            className={styles.search}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes and tickers…"
            aria-label="Search notes and tickers"
          />
        </div>
      )}

      {notes.length === 0 && !editing ? (
        <div className={vault.pane}>
          <p className={vault.empty}>
            No notes yet. Add one, or <Link href="/research">run a research brief</Link> and save it here. Notes become part
            of what the AI surfaces know about your portfolio.
          </p>
        </div>
      ) : (
        <div className={vault.layout} data-view={showReader || editing ? 'reader' : 'list'} data-list-hidden={listHidden}>
          <div className={`${vault.pane} ${vault.listPane}`}>
            {visible.length === 0 ? (
              <p className={vault.empty}>No notes match.</p>
            ) : (
              <NoteList notes={visible} selectedId={selected?.id ?? null} now={now} onSelect={select} onDelete={setDeleteId} />
            )}
          </div>
          <div className={`${vault.pane} ${vault.readerPane}`}>
            {editing ? (
              <NoteEditor key={editing.id ?? 'new'} initial={editing} busy={busy} error={error} onSave={save} onCancel={() => { setMode({ kind: 'read' }); setError(null); }} />
            ) : selected ? (
              <>
                <NoteReader
                  note={selected}
                  busy={busy}
                  listHidden={listHidden}
                  onEdit={() => setMode({ kind: 'edit', draft: draftOf(selected) })}
                  onDelete={() => setDeleteId(selected.id)}
                  onBack={() => setShowReader(false)}
                  onToggleList={() => setListHidden((h) => !h)}
                  onTagsChange={saveTags}
                  onExport={exportFile}
                />
                {error && <p className={vault.error}>{error}</p>}
              </>
            ) : (
              <p className={vault.empty}>Select a note to read it.</p>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this note?"
        message={toDelete ? `“${toDelete.title}” will be removed, and Mitra will stop using it.` : ''}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
