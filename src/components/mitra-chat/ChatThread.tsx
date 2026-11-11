'use client';

import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Composer, type ComposerHandle } from './Composer';
import { EmptyState } from './EmptyState';
import type { ChatContextState } from './useChatContext';
import type { StarterPrompt } from '@/lib/mitra-chat/starters';
import { MessageView } from './MessageView';
import type { Preferences } from '@/lib/preferences/schema';
import { chatErrorMessage, mitraApi, type ConversationDto, type UploadedFile } from './api';
import styles from './Chat.module.css';

interface ChatThreadProps {
  readonly initialConversationId: string | null;
  readonly initialMessages: readonly UIMessage[];
  readonly onConversationCreated: (conversation: ConversationDto) => void;
  /** Called after each completed reply so the rail can refresh titles and ordering. */
  readonly onActivity: () => void;
  readonly chatPrefs: Preferences['chat'];
  /** Greeting context for the empty state (first name and live-priced holdings). */
  readonly contextState: ChatContextState;
}

export function ChatThread({ initialConversationId, initialMessages, onConversationCreated, onActivity, chatPrefs, contextState }: ChatThreadProps) {
  // The id can appear mid-thread (a new chat creates its conversation on first send/attach),
  // so it lives in a ref the transport reads at request time rather than in the URL.
  const [session] = useState<{ id: string | null; creating: Promise<string> | null }>(() => ({
    id: initialConversationId,
    creating: null,
  }));

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (session.id) return session.id;
    session.creating ??= mitraApi.create().then((c) => {
      session.id = c.id;
      onConversationCreated(c);
      return c.id;
    });
    try {
      return await session.creating;
    } finally {
      session.creating = null;
    }
  }, [onConversationCreated, session]);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: '/api/mitra/conversations/pending/messages',
        // Server-authoritative history: send only the newest message and the real conversation URL.
        prepareSendMessagesRequest: ({ messages }) => ({
          api: `/api/mitra/conversations/${session.id}/messages`,
          body: { message: messages.at(-1) },
        }),
      })
  );

  const { messages, sendMessage, regenerate, stop, status, error, clearError } = useChat({
    id: initialConversationId ?? 'new-chat',
    messages: [...initialMessages],
    transport,
    onFinish: onActivity,
  });
  const busy = status === 'submitted' || status === 'streaming';

  const composer = useRef<ComposerHandle>(null);
  // Files can be dropped anywhere on the conversation. dragenter/leave fire for every child, so count depth.
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);
  const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;

  const [stuck, setStuck] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stuck) bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages, status, stuck]);

  const send = useCallback(
    async (text: string, files: readonly UploadedFile[]) => {
      clearError();
      setStuck(true);
      try {
        await ensureConversation();
      } catch {
        return;
      }
      void sendMessage({
        text,
        files: files.map((f) => ({ type: 'file' as const, mediaType: f.mediaType, filename: f.filename, url: f.url })),
      });
    },
    [clearError, ensureConversation, sendMessage]
  );

  const onStarter = useCallback(
    (card: StarterPrompt) => {
      if (card.action === 'send') {
        void send(card.prompt, []);
        return;
      }
      composer.current?.setDraft(card.prompt);
      composer.current?.focus();
      composer.current?.openFilePicker();
    },
    [send]
  );

  const failure = error ? chatErrorMessage(error) : null;
  const last = messages.at(-1);

  return (
    <section
      className={styles.thread}
      aria-label="Conversation"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current += 1;
        setDropping(true);
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault();
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropping(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDropping(false);
        composer.current?.addFiles([...e.dataTransfer.files]);
      }}
    >
      {dropping && (
        <div className={styles.dropZone} aria-hidden="true">
          <p className={styles.dropTitle}>Drop to attach</p>
          <p className={styles.dropText}>Annual reports and broker PDFs, screenshots, or earnings-call recordings</p>
        </div>
      )}
      <div
        ref={scroller}
        className={styles.scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
      >
        {messages.length === 0 ? (
          <EmptyState state={contextState} onPrompt={onStarter} />
        ) : (
          <div className={styles.messages}>
            {messages.map((m, i) => (
              <MessageView key={m.id} message={m} showToolActivity={chatPrefs.showToolActivity} streaming={busy && i === messages.length - 1 && m.role === 'assistant'} />
            ))}
            {status === 'submitted' && last?.role === 'user' && (
              <article className={`${styles.message} ${styles.messageAssistant}`} aria-label="Mitra">
                <div className={styles.bubble}>
                  <span className={styles.typing} aria-label="Mitra is thinking" />
                </div>
              </article>
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>

      {failure && (
        <div className={styles.error} role="alert">
          <span>
            {failure.text}{' '}
            {failure.needsKey && <Link href="/settings">Open Settings</Link>}
          </span>
          {!failure.needsKey && (
            <button type="button" className={styles.retry} onClick={() => void regenerate()}>
              Retry
            </button>
          )}
        </div>
      )}

      <Composer ref={composer} sendOnEnter={chatPrefs.sendOnEnter} dictationLanguage={chatPrefs.dictationLanguage} busy={busy} disabled={false} ensureConversation={ensureConversation} onSend={(t, f) => void send(t, f)} onStop={stop} />
      <p className={styles.disclaimer}>Mitra synthesises data; it is not investment advice.</p>
    </section>
  );
}
