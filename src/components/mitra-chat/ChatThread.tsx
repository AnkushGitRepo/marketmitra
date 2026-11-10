'use client';

import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Composer } from './Composer';
import { MessageView } from './MessageView';
import { chatErrorMessage, mitraApi, type ConversationDto, type UploadedFile } from './api';
import styles from './Chat.module.css';

const STARTERS = [
  'Is my portfolio too concentrated in a few stocks?',
  'Compare TCS and Infosys on margins, growth and valuation',
  'What should I check before applying for an IPO?',
  'Walk me through reading a company’s annual report — I’ll attach one',
];

interface ChatThreadProps {
  readonly initialConversationId: string | null;
  readonly initialMessages: readonly UIMessage[];
  readonly onConversationCreated: (conversation: ConversationDto) => void;
  /** Called after each completed reply so the rail can refresh titles and ordering. */
  readonly onActivity: () => void;
}

export function ChatThread({ initialConversationId, initialMessages, onConversationCreated, onActivity }: ChatThreadProps) {
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

  const failure = error ? chatErrorMessage(error) : null;
  const last = messages.at(-1);

  return (
    <section className={styles.thread} aria-label="Conversation">
      <div
        ref={scroller}
        className={styles.scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
        }}
      >
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <h2 className={styles.emptyTitle}>What are you working through?</h2>
            <p className={styles.emptyText}>
              Ask about a company, your portfolio or the market. Attach an annual report, a broker screenshot, or an earnings-call recording and Mitra will
              read it with you.
            </p>
            <div className={styles.starters}>
              {STARTERS.map((s) => (
                <button key={s} type="button" className={styles.starter} onClick={() => void send(s, [])}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.messages}>
            {messages.map((m, i) => (
              <MessageView key={m.id} message={m} streaming={busy && i === messages.length - 1 && m.role === 'assistant'} />
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
            {failure.needsKey && <Link href="/dashboard/settings">Open Settings</Link>}
          </span>
          {!failure.needsKey && (
            <button type="button" className={styles.retry} onClick={() => void regenerate()}>
              Retry
            </button>
          )}
        </div>
      )}

      <Composer busy={busy} disabled={false} ensureConversation={ensureConversation} onSend={(t, f) => void send(t, f)} onStop={stop} />
      <p className={styles.disclaimer}>Mitra synthesises data; it is not investment advice.</p>
    </section>
  );
}
