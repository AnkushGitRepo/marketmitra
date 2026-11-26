import dynamic from 'next/dynamic';
import type { UIMessage } from 'ai';
import { MarkdownLite } from '@/components/MarkdownLite';
import { MitraCharacter } from '@/components/mitra/MitraCharacter';
import { ASK_USER_TOOL, parseAskUserInput, visibleAnswer } from '@/lib/mitra-chat/askUser';
import { isCardToolPart, type CardToolOutput } from '@/lib/ai/a2uiToolTypes';
import { HOLDING_PROPOSAL_TOOL, parseProposalPart } from '@/lib/mitra-chat/holdingProposal';
import { splitFollowUps } from '@/lib/mitra-chat/followUps';
import { AskUserCard } from './AskUserCard';
import { FollowUpChips } from './FollowUpChips';
import { HoldingProposalCard } from './HoldingProposalCard';
import { AttachmentView } from './AttachmentView';
import { StageLine, ToolActivity } from './ToolActivity';
import { isActivityPart, stageOf, stageText, toolName } from '@/lib/mitra-chat/toolActivity';
import styles from './Chat.module.css';

// Loaded on demand: only a reply that carries a card pays for the A2UI renderer.
const A2uiView = dynamic(() => import('./A2uiView'), { ssr: false });

type Part = UIMessage['parts'][number];

/** Navigation tools return `{ to: '/dashboard/...' }`; surface it as a link, never auto-navigate mid-conversation. */
function navTarget(part: Part): string | null {
  const output = (part as { output?: unknown }).output;
  const to = output && typeof output === 'object' ? (output as { to?: unknown }).to : null;
  return typeof to === 'string' && to.startsWith('/dashboard') ? to : null;
}

interface PartViewProps {
  readonly part: Part;
  readonly role: UIMessage['role'];
  /** True on the last text part of a reply that is still streaming: it ends in a blinking cursor. */
  readonly cursor?: boolean;
  /** Set only on the newest message while idle: the question and holding cards are then answerable. Otherwise they are read-only. */
  readonly onAnswer?: (text: string) => void;
  /** The question on the card this user message answers, so the bubble can show just the answer. */
  readonly answeredQuestion?: string | null;
  /** A button on a card was pressed (the notes card's Open and Ask). */
  readonly onCardAction?: (name: string, context: Record<string, unknown>) => void;
}

function PartView({ part, role, cursor, onAnswer, answeredQuestion, onCardAction }: PartViewProps) {
  if (part.type === 'text') {
    return role === 'user' ? (
      <p className={styles.userText}>{visibleAnswer(part.text, answeredQuestion ?? null)}</p>
    ) : (
      <>
        <MarkdownLite text={splitFollowUps(part.text).body} className={cursor ? `${styles.markdown} ${styles.cursor}` : styles.markdown} />
        {/* Only the newest reply, once it is done, offers its chips; an older one would be a stale suggestion. */}
        {onAnswer && <FollowUpChips suggestions={splitFollowUps(part.text).suggestions} onPick={onAnswer} />}
      </>
    );
  }
  if (part.type === 'file') return <AttachmentView url={part.url} mediaType={part.mediaType} filename={part.filename} />;
  if (part.type === `tool-${ASK_USER_TOOL}`) {
    const question = parseAskUserInput((part as { input?: unknown }).input);
    return question ? <AskUserCard question={question} onAnswer={onAnswer} /> : null;
  }
  if (part.type === `tool-${HOLDING_PROPOSAL_TOOL}`) {
    const parsed = parseProposalPart(part as { input?: unknown; output?: unknown });
    return parsed ? <HoldingProposalCard proposal={parsed.proposal} output={parsed.output} onDecision={onAnswer} /> : null;
  }
  if (isCardToolPart(part.type)) {
    const output = (part as { output?: Partial<CardToolOutput> }).output;
    return output?.shown && Array.isArray(output.messages) ? <A2uiView messages={output.messages} onAction={onCardAction} /> : null;
  }
  return null;
}

export function MessageView({ message, streaming, showToolActivity = true, onAnswer, answeredQuestion, onCardAction }: { message: UIMessage; streaming: boolean; showToolActivity?: boolean; onAnswer?: (text: string) => void; answeredQuestion?: string | null; onCardAction?: (name: string, context: Record<string, unknown>) => void }) {
  const isUser = message.role === 'user';
  const files = message.parts.filter((p) => p.type === 'file');
  const rest = message.parts.filter((p) => p.type !== 'file' && !(!isUser && isActivityPart(p.type, isCardToolPart)));
  const hasActivity = !isUser && message.parts.some((p) => isActivityPart(p.type, isCardToolPart));
  const lastTextIndex = rest.findLastIndex((p) => p.type === 'text' && p.text.length > 0);
  // A navigation tool's page is linked from the opened list, never followed on its own.
  const targets: Record<string, string> = {};
  for (const p of message.parts) {
    const to = p.type.startsWith('tool-') ? navTarget(p) : null;
    if (to) targets[toolName(p.type)] = to;
  }
  const showStage = !isUser && streaming && stageOf(message.parts, isCardToolPart) !== 'writing';

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
              <PartView key={i} part={p} role={message.role} />
            ))}
          </div>
        )}
        {(hasActivity || showStage) && <ToolActivity parts={message.parts} streaming={streaming} showTools={showToolActivity} targets={targets} />}
        {rest.map((p, i) => (
          <PartView key={i} part={p} role={message.role} cursor={streaming && i === lastTextIndex} onAnswer={onAnswer} answeredQuestion={answeredQuestion} onCardAction={onCardAction} />
        ))}
      </div>
    </article>
  );
}

/** The placeholder reply shown between sending and the first part arriving. */
export function PendingReply() {
  return (
    <article className={`${styles.message} ${styles.messageAssistant}`} aria-label="Mitra">
      <span className={styles.avatar} aria-hidden="true">
        <MitraCharacter phase="thinking" size={28} />
      </span>
      <div className={styles.bubble}>
        <StageLine text={stageText('thinking', [], isCardToolPart)} />
      </div>
    </article>
  );
}
