'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import Link from 'next/link';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MessageView } from '@/components/mitra-chat/MessageView';
import { chatErrorMessage } from '@/components/mitra-chat/api';
import { ROOT_STARTERS, analystStarters } from '@/lib/analysts/chatPrompts';
import styles from './AnalystChat.module.css';

interface AnalystChatProps {
  /** The analyst's symbol, or null for the Root Agent. */
  readonly symbol: string | null;
}

const MAX_CHARS = 2000;

/** A compact chat with one stock analyst, or with the Root Agent. Not saved: it lives as long as the drawer is open. */
export function AnalystChat({ symbol }: AnalystChatProps) {
  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/analysts/chat', body: symbol ? { symbol } : {} }));
  const { messages, sendMessage, stop, status, error, clearError } = useChat({ transport });
  const [draft, setDraft] = useState('');
  const box = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const busy = status === 'submitted' || status === 'streaming';
  const starters = symbol ? analystStarters(symbol) : [...ROOT_STARTERS];
  const err = error ? chatErrorMessage(error) : null;

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [messages, status]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    clearError();
    setDraft('');
    void sendMessage({ text });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className={styles.root}>
      <div className={styles.thread} aria-live="polite">
        {messages.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>
              {symbol ? `Ask the ${symbol} analyst about its dossier, its journal or the latest figures.` : 'Ask the CIO across all your holdings. It answers from the analysts’ notes and your portfolio.'} It says so when something is not in our data.
            </p>
            <div className={styles.starters}>
              {starters.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={styles.starter}
                  onClick={() => {
                    // Fills the box only: nothing is sent until the user presses Send.
                    setDraft(s);
                    box.current?.focus();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => <MessageView key={m.id} message={m} streaming={busy && i === messages.length - 1} showToolActivity={false} />)
        )}
        {err && (
          <p className={styles.error} role="alert">
            {err.text} {err.needsKey && <Link href="/settings">Open Settings</Link>}
          </p>
        )}
        <div ref={end} />
      </div>
      <div className={styles.composer}>
        <textarea
          ref={box}
          className={styles.input}
          rows={2}
          value={draft}
          maxLength={MAX_CHARS}
          placeholder={symbol ? `Ask the ${symbol} analyst…` : 'Ask across all your holdings…'}
          aria-label={symbol ? `Message the ${symbol} analyst` : 'Message the Root Agent'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
        {busy ? (
          <button type="button" className={styles.send} onClick={() => void stop()}>
            Stop
          </button>
        ) : (
          <button type="button" className={styles.send} disabled={draft.trim() === ''} onClick={send}>
            Send
          </button>
        )}
      </div>
      <p className={styles.note}>AI-generated from public data and the analysts’ notes. Not investment advice.</p>
    </div>
  );
}
