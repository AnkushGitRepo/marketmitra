'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_NAME_LENGTH, validateWatchlistName } from '@/lib/wishlists/view';
import styles from './WatchlistNameDialog.module.css';

interface WatchlistNameDialogProps {
  readonly open: boolean;
  readonly mode: 'create' | 'rename';
  /** The list being renamed (its id is ignored by the duplicate check); omit when creating. */
  readonly target?: { id: string; name: string };
  /** The user's lists, for the duplicate check. */
  readonly existing: ReadonlyArray<{ id: string; name: string }>;
  readonly busy?: boolean;
  /** A server-side error to show under the field (e.g. the list limit). */
  readonly serverError?: string | null;
  readonly onSubmit: (name: string) => void;
  readonly onCancel: () => void;
}

/** A modal that names a new watchlist or renames one. Uses the native <dialog>: focus is trapped and Esc cancels. */
export function WatchlistNameDialog(props: WatchlistNameDialogProps) {
  const { open, mode, target, existing, busy = false, serverError = null, onSubmit, onCancel } = props;
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="wl-name-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      {/* Mounted only while open, so each opening starts from the right initial name. */}
      {open && (
        <NameForm
          key={`${mode}-${target?.id ?? 'new'}`}
          mode={mode}
          target={target}
          existing={existing}
          busy={busy}
          serverError={serverError}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      )}
    </dialog>
  );
}

function NameForm({ mode, target, existing, busy, serverError, onSubmit, onCancel }: Omit<WatchlistNameDialogProps, 'open'> & { busy: boolean; serverError: string | null }) {
  const [name, setName] = useState(mode === 'rename' ? (target?.name ?? '') : '');
  const [touched, setTouched] = useState(false);
  const problem = validateWatchlistName(name, existing, target?.id);
  const unchanged = mode === 'rename' && name.trim() === target?.name;
  const showProblem = touched && problem;

  const submit = () => {
    setTouched(true);
    if (problem || unchanged || busy) return;
    onSubmit(name.trim());
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 id="wl-name-title" className={styles.title}>
        {mode === 'create' ? 'New watchlist' : 'Rename watchlist'}
      </h2>
      <label className={styles.label} htmlFor="wl-name-input">
        Name
      </label>
      <input
        id="wl-name-input"
        className={styles.input}
        value={name}
        maxLength={MAX_NAME_LENGTH}
        placeholder="e.g. Banks, Dividend picks"
        autoFocus
        aria-invalid={showProblem ? true : undefined}
        aria-describedby="wl-name-error"
        onChange={(e) => {
          setName(e.target.value);
          setTouched(true);
        }}
      />
      <p id="wl-name-error" className={styles.error} role="alert">
        {showProblem ? problem : (serverError ?? '')}
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={styles.submit} disabled={busy || Boolean(problem) || unchanged}>
          {busy ? 'Saving…' : mode === 'create' ? 'Create' : 'Rename'}
        </button>
      </div>
    </form>
  );
}
