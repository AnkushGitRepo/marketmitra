import type { AttachmentKind } from './attachments';

export interface Conversation {
  readonly id: string;
  readonly title: string;
  readonly titleSource: 'auto' | 'user';
  readonly messageCount: number;
  /** Running summary of messages older than the verbatim window. */
  readonly summary: string;
  /** How many leading messages `summary` already covers. */
  readonly summarizedThrough: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface StoredFile {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly kind: AttachmentKind;
  readonly size: number;
  readonly createdAt: Date;
  /** Set once a saved message references the file; attached files can't be deleted individually. */
  readonly attachedAt: Date | null;
}

export interface NewFile {
  readonly userId: string;
  readonly conversationId: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly kind: AttachmentKind;
  readonly bytes: Uint8Array;
}

/** Where attachment bytes live. GridFS today; a Blob backend can slot in later (ADR 0036). */
export interface FileStore {
  put(file: NewFile): Promise<StoredFile>;
  getMeta(userId: string, id: string): Promise<StoredFile | null>;
  read(userId: string, id: string): Promise<{ meta: StoredFile; bytes: Uint8Array } | null>;
  markAttached(userId: string, ids: readonly string[]): Promise<void>;
  /** Deletes an unattached file; returns false if missing or already attached. */
  remove(userId: string, id: string): Promise<boolean>;
  removeByConversation(userId: string, conversationId: string): Promise<number>;
  usedBytes(userId: string): Promise<number>;
}
