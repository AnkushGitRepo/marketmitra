'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ClipboardEvent, type KeyboardEvent, type Ref } from 'react';
import { MAX_FILES_PER_MESSAGE, MAX_FILE_BYTES, MAX_MESSAGE_CHARS } from '@/lib/mitra-chat/limits';
import { formatBytes } from '@/lib/mitra-chat/uiHelpers';
import { mitraApi, type UploadedFile } from './api';
import { MicHelpDialog } from './MicHelpDialog';
import { useDictation } from './useDictation';
import styles from './Composer.module.css';

const ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,application/pdf,audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm,.txt,.csv,.md';

type Pending =
  | { readonly key: string; readonly name: string; readonly size: number; readonly status: 'uploading' }
  | { readonly key: string; readonly name: string; readonly size: number; readonly status: 'error'; readonly error: string }
  | { readonly key: string; readonly name: string; readonly size: number; readonly status: 'ready'; readonly file: UploadedFile };

/** What the thread can ask the composer to do: take dropped files, open the file picker, prefill the box. */
export interface ComposerHandle {
  readonly addFiles: (files: readonly File[]) => void;
  readonly openFilePicker: () => void;
  readonly setDraft: (text: string) => void;
  readonly focus: () => void;
}

interface ComposerProps {
  readonly ref?: Ref<ComposerHandle>;
  /** Enter sends (default) or, when false, Cmd/Ctrl+Enter sends and Enter adds a new line. */
  readonly sendOnEnter?: boolean;
  readonly dictationLanguage?: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  /** Resolves the conversation id, creating the conversation on first use. */
  readonly ensureConversation: () => Promise<string>;
  readonly onSend: (text: string, files: readonly UploadedFile[]) => void;
  readonly onStop: () => void;
}

export function Composer({ ref, sendOnEnter = true, dictationLanguage = 'auto', busy, disabled, ensureConversation, onSend, onStop }: ComposerProps) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<readonly Pending[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const dictation = useDictation(
    useCallback((text: string) => setDraft((d) => (d && !d.endsWith(' ') ? `${d} ${text}` : `${d}${text}`)), []),
    dictationLanguage
  );

  // Grow with content up to ~8 lines.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const update = (key: string, next: Pending) => setPending((all) => all.map((p) => (p.key === key ? next : p)));

  const addFiles = useCallback(
    async (incoming: readonly File[]) => {
      if (incoming.length === 0) return;
      setNotice(null);
      const room = MAX_FILES_PER_MESSAGE - pending.length;
      const accepted = incoming.slice(0, Math.max(0, room));
      if (incoming.length > accepted.length) setNotice(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);

      const entries = accepted.map((file) => ({ file, key: `${file.name}-${file.size}-${crypto.randomUUID()}` }));
      setPending((all) => [
        ...all,
        ...entries.map(({ file, key }): Pending =>
          file.size > MAX_FILE_BYTES
            ? { key, name: file.name, size: file.size, status: 'error', error: `Over the ${formatBytes(MAX_FILE_BYTES)} limit` }
            : { key, name: file.name, size: file.size, status: 'uploading' }
        ),
      ]);

      let conversationId: string;
      try {
        conversationId = await ensureConversation();
      } catch {
        for (const { file, key } of entries) update(key, { key, name: file.name, size: file.size, status: 'error', error: 'Could not start a chat' });
        return;
      }
      await Promise.all(
        entries
          .filter(({ file }) => file.size <= MAX_FILE_BYTES)
          .map(async ({ file, key }) => {
            try {
              const uploaded = await mitraApi.upload(conversationId, file);
              update(key, { key, name: uploaded.filename, size: uploaded.size, status: 'ready', file: uploaded });
            } catch (e) {
              update(key, { key, name: file.name, size: file.size, status: 'error', error: e instanceof Error ? e.message : 'Upload failed' });
            }
          })
      );
    },
    [ensureConversation, pending.length]
  );

  const remove = (item: Pending) => {
    setPending((all) => all.filter((p) => p.key !== item.key));
    if (item.status === 'ready') void mitraApi.removeFile(item.file.id).catch(() => undefined);
  };

  const ready = pending.filter((p): p is Extract<Pending, { status: 'ready' }> => p.status === 'ready');
  const uploading = pending.some((p) => p.status === 'uploading');
  const canSend = !disabled && !busy && !uploading && (draft.trim().length > 0 || ready.length > 0);

  useImperativeHandle(
    ref,
    () => ({
      addFiles: (files) => void addFiles(files),
      openFilePicker: () => fileInput.current?.click(),
      setDraft: (text) => setDraft(text),
      focus: () => textarea.current?.focus(),
    }),
    [addFiles]
  );

  const send = () => {
    if (!canSend) return;
    onSend(draft.trim(), ready.map((p) => p.file));
    setDraft('');
    setPending([]);
    setNotice(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const modifier = e.metaKey || e.ctrlKey;
    const wantsSend = sendOnEnter ? !e.shiftKey : modifier;
    if (e.key === 'Enter' && wantsSend && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const onPaste = (e: ClipboardEvent) => {
    const files = [...e.clipboardData.files];
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };
  return (
    <div className={styles.composer}>
      {pending.length > 0 && (
        <ul className={styles.chips} aria-label="Attachments">
          {pending.map((p) => (
            <li key={p.key} className={`${styles.chip} ${p.status === 'error' ? styles.chipError : ''}`}>
              <span className={styles.chipName}>{p.name}</span>
              <span className={styles.chipMeta}>
                {p.status === 'uploading' ? 'Uploading…' : p.status === 'error' ? p.error : formatBytes(p.size)}
              </span>
              <button type="button" className={styles.chipRemove} onClick={() => remove(p)} aria-label={`Remove ${p.name}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <MicHelpDialog help={dictation.help} onRetry={dictation.start} onClose={dictation.dismissHelp} />

      <textarea
        ref={textarea}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        rows={1}
        maxLength={MAX_MESSAGE_CHARS}
        placeholder="Ask about a stock or your portfolio…"
        aria-label="Message Mitra"
        className={styles.textarea}
        disabled={disabled}
      />

      <div className={styles.toolbar}>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className={styles.attachBtn}
          onClick={() => fileInput.current?.click()}
          disabled={disabled}
          aria-label="Attach files"
          title="Upload annual report, concall recording, broker PDF or screenshot"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M16.5 9.5 10 16a4 4 0 0 1-5.7-5.7l7-7a2.7 2.7 0 0 1 3.8 3.8l-7 7a1.3 1.3 0 0 1-1.9-1.9l6.4-6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className={styles.attachLabel}>Attach</span>
        </button>
        {dictation.supported && (
          <button
            type="button"
            className={`${styles.iconBtn} ${dictation.listening ? styles.listening : ''}`}
            onClick={dictation.listening ? dictation.stop : dictation.start}
            disabled={disabled}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? 'Stop dictation' : 'Dictate a message'}
            title="Dictate by voice. Your browser sends the audio to its own speech service."
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
        <span className={styles.hint} role="status">
          {dictation.error ?? notice ?? (sendOnEnter ? 'Enter to send · Shift+Enter for a new line' : 'Ctrl/Cmd+Enter to send · Enter for a new line')}
        </span>
        {busy ? (
          <button type="button" className={`${styles.sendBtn} ${styles.sendReady}`} onClick={onStop} aria-label="Stop generating">
            Stop
          </button>
        ) : (
          <button type="button" className={`${styles.sendBtn} ${canSend ? styles.sendReady : ''}`} onClick={send} disabled={!canSend} aria-label="Send message">
            Send
          </button>
        )}
      </div>
    </div>
  );
}
