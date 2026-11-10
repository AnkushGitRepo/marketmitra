import { MAX_FILE_BYTES, MAX_USER_STORAGE_BYTES } from './limits';
import { sniffAttachment } from './attachments';
import type { FileStore, StoredFile } from './types';

export type UploadResult =
  | { readonly ok: true; readonly file: StoredFile }
  | { readonly ok: false; readonly status: 404 | 413 | 415 | 422; readonly error: string };

/** Strips any path, control characters and excess length from a client-supplied filename. */
export function cleanFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim().slice(-120);
  return cleaned || 'attachment';
}

interface UploadInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly filename: string;
  readonly bytes: Uint8Array;
}

interface UploadDeps {
  readonly store: FileStore;
  /** True if the conversation exists and belongs to the user. */
  readonly ownsConversation: (userId: string, conversationId: string) => Promise<boolean>;
}

/** Validates (size, ownership, real content type, quota) then stores one attachment. */
export async function processUpload(input: UploadInput, deps: UploadDeps): Promise<UploadResult> {
  if (input.bytes.length === 0) return { ok: false, status: 422, error: 'That file is empty.' };
  if (input.bytes.length > MAX_FILE_BYTES) {
    return { ok: false, status: 413, error: `Files can be at most ${Math.floor(MAX_FILE_BYTES / 1_000_000)} MB.` };
  }
  if (!(await deps.ownsConversation(input.userId, input.conversationId))) {
    return { ok: false, status: 404, error: 'Conversation not found.' };
  }
  const filename = cleanFilename(input.filename);
  const sniffed = sniffAttachment(input.bytes, filename);
  if (!sniffed) {
    return { ok: false, status: 415, error: 'Unsupported file. Attach an image, PDF, audio file, or a .txt/.csv/.md file.' };
  }
  const used = await deps.store.usedBytes(input.userId);
  if (used + input.bytes.length > MAX_USER_STORAGE_BYTES) {
    return { ok: false, status: 413, error: 'Your attachment storage is full. Delete an old conversation to free space.' };
  }
  const file = await deps.store.put({
    userId: input.userId,
    conversationId: input.conversationId,
    filename,
    mediaType: sniffed.mediaType,
    kind: sniffed.kind,
    bytes: input.bytes,
  });
  return { ok: true, file };
}
