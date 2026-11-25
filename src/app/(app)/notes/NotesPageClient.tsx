'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { InfoPopover } from '@/components/common/InfoPopover';
import { EMPTY_DRAFT, NoteEditor, type NoteDraft } from '@/components/notes/NoteEditor';
import { NoteList } from '@/components/notes/NoteList';
import { NoteReader } from '@/components/notes/NoteReader';
import vault from '@/components/notes/NotesVault.module.css';
import type { UserNote } from '@/lib/notes/userNotes';
import { NOTE_FILTERS, filterCounts, filterNotes, type NoteFilter } from '@/lib/notes/vault';
import styles from './page.module.css';

interface Props {
  notes: UserNote[];
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

export function NotesPageClient({ notes }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const [showReader, setShowReader] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: 'read' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${selected.id}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedId(null);
        setShowReader(false);
        router.refresh();
      } else {
        setError('Could not delete the note.');
      }
    } catch {
      setError('Could not delete the note. Check your connection and try again.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
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
        <div className={vault.layout} data-view={showReader || editing ? 'reader' : 'list'}>
          <div className={`${vault.pane} ${vault.listPane}`}>
            {visible.length === 0 ? (
              <p className={vault.empty}>No notes match.</p>
            ) : (
              <NoteList notes={visible} selectedId={selected?.id ?? null} now={now} onSelect={select} />
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
                  onEdit={() => setMode({ kind: 'edit', draft: draftOf(selected) })}
                  onDelete={() => setConfirmDelete(true)}
                  onBack={() => setShowReader(false)}
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
        open={confirmDelete}
        title="Delete this note?"
        message={selected ? `“${selected.title}” will be removed, and Mitra will stop using it.` : ''}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
