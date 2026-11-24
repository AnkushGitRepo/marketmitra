'use client';

import { useState, type FormEvent } from 'react';
import { answerText, type AskUserInput } from '@/lib/mitra-chat/askUser';
import styles from './AskUserCard.module.css';

interface AskUserCardProps {
  readonly question: AskUserInput;
  /** Present only while the card can still be answered; without it the card is a read-only record. */
  readonly onAnswer?: (text: string) => void;
}

/** Mitra's clarifying question: option buttons (one or several) plus a free-text answer. */
export function AskUserCard({ question, onAnswer }: AskUserCardProps) {
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [other, setOther] = useState('');
  const multiple = question.multiple === true;
  const answerable = onAnswer !== undefined;
  const send = (choices: readonly string[], extra?: string) => onAnswer?.(answerText(question.question, choices, extra));

  const toggle = (label: string) => {
    if (!multiple) return send([label]);
    setPicked((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };
  const submitOther = (e: FormEvent) => {
    e.preventDefault();
    if (other.trim()) send(multiple ? picked : [], other);
  };
  const canSend = picked.length > 0 || other.trim().length > 0;

  return (
    <div className={styles.card} role="group" aria-label="Question from Mitra">
      <p className={styles.question}>{question.question}</p>
      <div className={styles.options}>
        {question.options.map((o) => {
          const on = picked.includes(o.label);
          return (
            <button key={o.label} type="button" className={`${styles.option} ${on ? styles.optionOn : ''}`} disabled={!answerable} aria-pressed={multiple ? on : undefined} onClick={() => toggle(o.label)}>
              <span className={styles.optionLabel}>{o.label}</span>
              {o.description && <span className={styles.optionHint}>{o.description}</span>}
            </button>
          );
        })}
      </div>
      {answerable && (
        <form className={styles.other} onSubmit={submitOther}>
          <input className={styles.input} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Or type your own answer" maxLength={200} aria-label="Your own answer" />
          {(multiple || other.trim()) && (
            <button type="submit" className={styles.send} disabled={!canSend}>
              Send
            </button>
          )}
        </form>
      )}
    </div>
  );
}
