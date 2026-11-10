import { randomUUID } from 'node:crypto';
import type { FileStore, NewFile, StoredFile } from './types';

/** In-memory FileStore — a test double that also documents the contract. */
export function createMemoryFileStore(): FileStore & { readonly size: () => number } {
  const files = new Map<string, { meta: StoredFile; bytes: Uint8Array }>();
  const owned = (userId: string, id: string) => {
    const f = files.get(id);
    return f && f.meta.userId === userId ? f : null;
  };

  return {
    size: () => files.size,
    async put(input: NewFile) {
      const meta: StoredFile = {
        id: randomUUID().replace(/-/g, '').slice(0, 24),
        userId: input.userId,
        conversationId: input.conversationId,
        filename: input.filename,
        mediaType: input.mediaType,
        kind: input.kind,
        size: input.bytes.length,
        createdAt: new Date(),
        attachedAt: null,
      };
      files.set(meta.id, { meta, bytes: input.bytes });
      return meta;
    },
    async getMeta(userId, id) {
      return owned(userId, id)?.meta ?? null;
    },
    async read(userId, id) {
      return owned(userId, id) ?? null;
    },
    async markAttached(userId, ids) {
      for (const id of ids) {
        const f = owned(userId, id);
        if (f) files.set(id, { ...f, meta: { ...f.meta, attachedAt: new Date() } });
      }
    },
    async remove(userId, id) {
      const f = owned(userId, id);
      if (!f || f.meta.attachedAt) return false;
      files.delete(id);
      return true;
    },
    async removeByConversation(userId, conversationId) {
      let n = 0;
      for (const [id, f] of files) {
        if (f.meta.userId === userId && f.meta.conversationId === conversationId) {
          files.delete(id);
          n += 1;
        }
      }
      return n;
    },
    async usedBytes(userId) {
      return [...files.values()].filter((f) => f.meta.userId === userId).reduce((s, f) => s + f.meta.size, 0);
    },
  };
}
