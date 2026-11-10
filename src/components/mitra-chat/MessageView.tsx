import Link from 'next/link';
import type { UIMessage } from 'ai';
import { MarkdownLite } from '@/components/MarkdownLite';
import { MitraCharacter } from '@/components/mitra/MitraCharacter';
import { AttachmentView } from './AttachmentView';
import styles from './Chat.module.css';

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

function PartView({ part, role, showToolActivity }: { part: Part; role: UIMessage['role']; showToolActivity: boolean }) {
  if (part.type === 'text') {
    return role === 'user' ? (
      <p className={styles.userText}>{part.text}</p>
    ) : (
      <MarkdownLite text={part.text} className={styles.markdown} />
    );
  }
  if (part.type === 'file') return <AttachmentView url={part.url} mediaType={part.mediaType} filename={part.filename} />;
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

export function MessageView({ message, streaming, showToolActivity = true }: { message: UIMessage; streaming: boolean; showToolActivity?: boolean }) {
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
          <PartView key={i} part={p} role={message.role} showToolActivity={showToolActivity} />
        ))}
        {!isUser && streaming && !hasText && <span className={styles.typing} aria-label="Mitra is thinking" />}
      </div>
    </article>
  );
}
