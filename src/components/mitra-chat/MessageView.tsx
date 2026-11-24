import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { UIMessage } from 'ai';
import { MarkdownLite } from '@/components/MarkdownLite';
import { MitraCharacter } from '@/components/mitra/MitraCharacter';
import { ASK_USER_TOOL, parseAskUserInput, visibleAnswer } from '@/lib/mitra-chat/askUser';
import { SHOW_PORTFOLIO_SNAPSHOT_TOOL, type SnapshotToolOutput } from '@/lib/ai/a2uiToolTypes';
import { AskUserCard } from './AskUserCard';
import { AttachmentView } from './AttachmentView';
import styles from './Chat.module.css';

// Loaded on demand: only a reply that carries a card pays for the A2UI renderer.
const A2uiView = dynamic(() => import('./A2uiView'), { ssr: false });

type Part = UIMessage['parts'][number];

const TOOL_LABELS: Record<string, string> = {
  search_context: 'Searched your knowledge base',
  run_screener: 'Ran the screener',
  get_screener_options: 'Checked screener options',
};

function toolLabel(type: string): string {
  const name = type.replace(/^tool-/, '');
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ');
}

/** Navigation tools return `{ to: '/dashboard/...' }`; surface it as a link, never auto-navigate mid-conversation. */
function navTarget(part: Part): string | null {
  const output = (part as { output?: unknown }).output;
  const to = output && typeof output === 'object' ? (output as { to?: unknown }).to : null;
  return typeof to === 'string' && to.startsWith('/dashboard') ? to : null;
}

interface PartViewProps {
  readonly part: Part;
  readonly role: UIMessage['role'];
  readonly showToolActivity: boolean;
  /** Set only on the newest message while idle: the question card is then answerable. Otherwise it is read-only. */
  readonly onAnswer?: (text: string) => void;
  /** The question on the card this user message answers, so the bubble can show just the answer. */
  readonly answeredQuestion?: string | null;
}

function PartView({ part, role, showToolActivity, onAnswer, answeredQuestion }: PartViewProps) {
  if (part.type === 'text') {
    return role === 'user' ? (
      <p className={styles.userText}>{visibleAnswer(part.text, answeredQuestion ?? null)}</p>
    ) : (
      <MarkdownLite text={part.text} className={styles.markdown} />
    );
  }
  if (part.type === 'file') return <AttachmentView url={part.url} mediaType={part.mediaType} filename={part.filename} />;
  if (part.type === `tool-${ASK_USER_TOOL}`) {
    const question = parseAskUserInput((part as { input?: unknown }).input);
    return question ? <AskUserCard question={question} onAnswer={onAnswer} /> : null;
  }
  if (part.type === `tool-${SHOW_PORTFOLIO_SNAPSHOT_TOOL}`) {
    const output = (part as { output?: Partial<SnapshotToolOutput> }).output;
    return output?.shown && Array.isArray(output.messages) ? <A2uiView messages={output.messages} /> : null;
  }
  if (part.type.startsWith('tool-')) {
    if (!showToolActivity) return null;
    const target = navTarget(part);
    return (
      <span className={styles.toolChip}>
        {toolLabel(part.type)}
        {target && (
          <>
            {' · '}
            <Link href={target}>Open</Link>
          </>
        )}
      </span>
    );
  }
  return null;
}

export function MessageView({ message, streaming, showToolActivity = true, onAnswer, answeredQuestion }: { message: UIMessage; streaming: boolean; showToolActivity?: boolean; onAnswer?: (text: string) => void; answeredQuestion?: string | null }) {
  const isUser = message.role === 'user';
  const files = message.parts.filter((p) => p.type === 'file');
  const rest = message.parts.filter((p) => p.type !== 'file');
  const hasText = message.parts.some((p) => p.type === 'text' && p.text.length > 0);

  return (
    <article className={`${styles.message} ${isUser ? styles.messageUser : styles.messageAssistant}`} aria-label={isUser ? 'You' : 'Mitra'}>
      {!isUser && (
        <span className={styles.avatar} aria-hidden="true">
          <MitraCharacter phase={streaming ? 'thinking' : 'idle'} size={28} />
        </span>
      )}
      <div className={styles.bubble}>
        {files.length > 0 && (
          <div className={styles.attachments}>
            {files.map((p, i) => (
              <PartView key={i} part={p} role={message.role} showToolActivity={showToolActivity} />
            ))}
          </div>
        )}
        {rest.map((p, i) => (
          <PartView key={i} part={p} role={message.role} showToolActivity={showToolActivity} onAnswer={onAnswer} answeredQuestion={answeredQuestion} />
        ))}
        {!isUser && streaming && !hasText && <span className={styles.typing} aria-label="Mitra is thinking" />}
      </div>
    </article>
  );
}
