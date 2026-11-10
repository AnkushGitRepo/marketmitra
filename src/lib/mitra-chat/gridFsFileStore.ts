import { GridFSBucket, ObjectId, type Document } from 'mongodb';
import { getDb } from '@/lib/mongodb';
import type { AttachmentKind } from './attachments';
import type { FileStore, NewFile, StoredFile } from './types';

const BUCKET = 'mitraFiles';

interface FileDoc extends Document {
  _id: ObjectId;
  length: number;
  uploadDate: Date;
  filename: string;
  metadata: {
    userId: string;
    conversationId: string;
    mediaType: string;
    kind: AttachmentKind;
    attachedAt: Date | null;
  };
}

function toStored(doc: FileDoc): StoredFile {
  return {
    id: doc._id.toString(),
    userId: doc.metadata.userId,
    conversationId: doc.metadata.conversationId,
    filename: doc.filename,
    mediaType: doc.metadata.mediaType,
    kind: doc.metadata.kind,
    size: doc.length,
    createdAt: doc.uploadDate,
    attachedAt: doc.metadata.attachedAt ?? null,
  };
}

async function handles() {
  const db = await getDb();
  return { bucket: new GridFSBucket(db, { bucketName: BUCKET }), files: db.collection<FileDoc>(`${BUCKET}.files`) };
}

async function readAll(bucket: GridFSBucket, id: ObjectId): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of bucket.openDownloadStream(id)) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
}

/** MongoDB GridFS-backed store: free, no new vendor, identical in hosted and self-host modes. */
export function createGridFsFileStore(): FileStore {
  return {
    async put(file: NewFile) {
      const { bucket, files } = await handles();
      const id = new ObjectId();
      await new Promise<void>((resolve, reject) => {
        const upload = bucket.openUploadStreamWithId(id, file.filename, {
          metadata: {
            userId: file.userId,
            conversationId: file.conversationId,
            mediaType: file.mediaType,
            kind: file.kind,
            attachedAt: null,
          },
        });
        upload.once('error', reject);
        upload.once('finish', () => resolve());
        upload.end(Buffer.from(file.bytes));
      });
      const doc = await files.findOne({ _id: id });
      if (!doc) throw new Error('Upload was not persisted');
      return toStored(doc);
    },

    async getMeta(userId, id) {
      if (!ObjectId.isValid(id)) return null;
      const { files } = await handles();
      const doc = await files.findOne({ _id: new ObjectId(id), 'metadata.userId': userId });
      return doc ? toStored(doc) : null;
    },

    async read(userId, id) {
      const meta = await this.getMeta(userId, id);
      if (!meta) return null;
      const { bucket } = await handles();
      return { meta, bytes: await readAll(bucket, new ObjectId(id)) };
    },

    async markAttached(userId, ids) {
      const valid = ids.filter((i) => ObjectId.isValid(i)).map((i) => new ObjectId(i));
      if (valid.length === 0) return;
      const { files } = await handles();
      await files.updateMany(
        { _id: { $in: valid }, 'metadata.userId': userId },
        { $set: { 'metadata.attachedAt': new Date() } }
      );
    },

    async remove(userId, id) {
      const meta = await this.getMeta(userId, id);
      if (!meta || meta.attachedAt) return false;
      const { bucket } = await handles();
      await bucket.delete(new ObjectId(id));
      return true;
    },

    async removeByConversation(userId, conversationId) {
      const { bucket, files } = await handles();
      const docs = await files
        .find({ 'metadata.userId': userId, 'metadata.conversationId': conversationId })
        .project<{ _id: ObjectId }>({ _id: 1 })
        .toArray();
      for (const d of docs) await bucket.delete(d._id);
      return docs.length;
    },

    async usedBytes(userId) {
      const { files } = await handles();
      const [row] = await files
        .aggregate<{ total: number }>([
          { $match: { 'metadata.userId': userId } },
          { $group: { _id: null, total: { $sum: '$length' } } },
        ])
        .toArray();
      return row?.total ?? 0;
    },
  };
}

let shared: FileStore | undefined;
export function getFileStore(): FileStore {
  shared ??= createGridFsFileStore();
  return shared;
}
