import type { UIMessage } from 'ai';
import {
  FILE_URL_PREFIX,
  INLINE_ATTACHMENT_BYTE_BUDGET,
  INLINE_ATTACHMENT_MESSAGES,
  INLINE_TEXT_FILE_CHARS,
} from './limits';
import type { FileStore } from './types';

type Part = UIMessage['parts'][number];
type FilePart = Extract<Part, { type: 'file' }>;

const FILE_URL = new RegExp(`^${FILE_URL_PREFIX.replace(/\//g, '\\/')}([a-f0-9]{24})$`);

export function fileIdFromUrl(url: string): string | null {
  return FILE_URL.exec(url)?.[1] ?? null;
}

export function fileUrl(id: string): string {
  return `${FILE_URL_PREFIX}${id}`;
}

const textPart = (text: string): Part => ({ type: 'text', text });

const placeholder = (part: FilePart, why: string): Part =>
  textPart(`[Attachment "${part.filename ?? 'file'}" (${part.mediaType}) ${why}]`);

/** Tool calls, reasoning and step markers are dropped from older turns to keep the window small. */
const isKept = (part: Part): boolean => part.type === 'text' || part.type === 'file';

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

/**
 * Turns stored UI messages (whose files are `/api/mitra/files/<id>` references) into
 * messages a model can read: bytes for attachments in the newest few user turns,
 * a short placeholder for older ones, text files inlined as text, and tool noise
 * stripped from everything but the last two messages.
 */
export async function prepareModelMessages(
  messages: readonly UIMessage[],
  deps: { readonly store: FileStore; readonly userId: string }
): Promise<UIMessage[]> {
  const recentWithFiles = new Set<number>();
  for (let i = messages.length - 1; i >= 0 && recentWithFiles.size < INLINE_ATTACHMENT_MESSAGES; i--) {
    if (messages[i].role === 'user' && messages[i].parts.some((p) => p.type === 'file')) recentWithFiles.add(i);
  }

  let budget = INLINE_ATTACHMENT_BYTE_BUDGET;
  const out: UIMessage[] = [];

  // Newest first so the budget favours the latest attachments; reversed at the end.
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const keepTools = i >= messages.length - 2;
    const parts: Part[] = [];

    for (const part of message.parts) {
      if (part.type !== 'file') {
        if (keepTools || isKept(part)) parts.push(part);
        continue;
      }
      if (!recentWithFiles.has(i)) {
        parts.push(placeholder(part, 'was shared earlier and is no longer in context; ask the user to re-attach it if needed'));
        continue;
      }
      const id = fileIdFromUrl(part.url);
      const stored = id ? await deps.store.read(deps.userId, id) : null;
      if (!stored) {
        parts.push(placeholder(part, 'is no longer available'));
      } else if (stored.meta.kind === 'text') {
        const body = new TextDecoder().decode(stored.bytes).slice(0, INLINE_TEXT_FILE_CHARS);
        parts.push(textPart(`Attachment "${stored.meta.filename}":\n${body}`));
      } else if (stored.bytes.length > budget) {
        parts.push(placeholder(part, 'was too large to include alongside the other attachments'));
      } else {
        budget -= stored.bytes.length;
        parts.push({
          type: 'file',
          mediaType: stored.meta.mediaType,
          filename: stored.meta.filename,
          url: `data:${stored.meta.mediaType};base64,${toBase64(stored.bytes)}`,
        });
      }
    }

    if (parts.length > 0) out.push({ ...message, parts });
  }
  return out.reverse();
}

/** Plain-text transcript of messages, for the summariser. */
export function transcriptOf(messages: readonly UIMessage[]): string {
  return messages
    .map((m) => {
      const text = m.parts
        .map((p) => (p.type === 'text' ? p.text : p.type === 'file' ? `[attached: ${p.filename ?? p.mediaType}]` : ''))
        .filter(Boolean)
        .join(' ');
      return text ? `${m.role === 'user' ? 'User' : 'Mitra'}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');
}
