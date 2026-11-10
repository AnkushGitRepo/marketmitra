import { z } from 'zod';
import type { UIMessage } from 'ai';
import type { AttachmentKind } from './attachments';
import { MAX_FILES_PER_MESSAGE, MAX_MESSAGE_CHARS } from './limits';
import { fileIdFromUrl, fileUrl } from './prepareMessages';
import type { FileStore } from './types';

const rawMessageSchema = z.object({
  id: z.string().min(1).max(64),
  role: z.literal('user'),
  parts: z
    .array(
      z.discriminatedUnion('type', [
        z.object({ type: z.literal('text'), text: z.string() }),
        z.object({ type: z.literal('file'), url: z.string().max(200) }),
      ])
    )
    .min(1)
    .max(MAX_FILES_PER_MESSAGE + 1),
});

export type SanitizedMessage =
  | { readonly ok: true; readonly message: UIMessage; readonly fileIds: string[]; readonly kinds: AttachmentKind[] }
  | { readonly ok: false; readonly status: 422; readonly error: string };

const fail = (error: string): SanitizedMessage => ({ ok: false, status: 422, error });

/**
 * Turns the client's new-message payload into a trusted user UIMessage. Text is
 * bounded; every file must be one of the caller's own uploads for THIS
 * conversation, and its name/type are rebuilt from the stored record rather than
 * trusted from the client.
 */
export async function sanitizeUserMessage(
  raw: unknown,
  ctx: { readonly userId: string; readonly conversationId: string; readonly store: FileStore }
): Promise<SanitizedMessage> {
  const parsed = rawMessageSchema.safeParse(raw);
  if (!parsed.success) return fail('Invalid message.');

  const text = parsed.data.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
    .trim();
  if (text.length > MAX_MESSAGE_CHARS) return fail(`Messages can be at most ${MAX_MESSAGE_CHARS} characters.`);

  const urls = parsed.data.parts.filter((p): p is { type: 'file'; url: string } => p.type === 'file').map((p) => p.url);
  if (urls.length > MAX_FILES_PER_MESSAGE) return fail(`Attach at most ${MAX_FILES_PER_MESSAGE} files per message.`);
  if (!text && urls.length === 0) return fail('Write a message or attach a file.');

  const fileParts: UIMessage['parts'] = [];
  const fileIds: string[] = [];
  const kinds: AttachmentKind[] = [];
  for (const url of urls) {
    const id = fileIdFromUrl(url);
    const meta = id ? await ctx.store.getMeta(ctx.userId, id) : null;
    if (!id || !meta || meta.conversationId !== ctx.conversationId) return fail('An attachment is missing or not yours.');
    if (fileIds.includes(id)) continue;
    fileIds.push(id);
    kinds.push(meta.kind);
    fileParts.push({ type: 'file', mediaType: meta.mediaType, filename: meta.filename, url: fileUrl(id) });
  }

  const parts: UIMessage['parts'] = [...(text ? [{ type: 'text' as const, text }] : []), ...fileParts];
  return { ok: true, message: { id: parsed.data.id, role: 'user', parts }, fileIds, kinds };
}
