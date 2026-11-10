import { describe, expect, it } from 'vitest';
import { createMemoryFileStore } from './memoryFileStore';
import { cleanFilename, processUpload } from './upload';
import { sanitizeUserMessage } from './messageInput';
import { MAX_FILE_BYTES, MAX_FILES_PER_MESSAGE, MAX_MESSAGE_CHARS, MAX_USER_STORAGE_BYTES } from './limits';
import { fileUrl } from './prepareMessages';

const png = (n = 32) => {
  const b = new Uint8Array(n);
  b.set([0x89, 0x50, 0x4e, 0x47]);
  return b;
};
const owns = (ok = true) => async () => ok;

describe('cleanFilename', () => {
  it('drops paths, control chars and reserved characters', () => {
    expect(cleanFilename('../../etc/pass"wd.png')).toBe('passwd.png');
    expect(cleanFilename('C:\\Users\\me\\a<b>.pdf')).toBe('ab.pdf');
    expect(cleanFilename('   ')).toBe('attachment');
    expect(cleanFilename('x'.repeat(300)).length).toBe(120);
  });
});

describe('processUpload', () => {
  const base = { userId: 'u1', conversationId: 'c1', filename: 'chart.png', bytes: png() };

  it('stores a valid file with the sniffed type, ignoring what the client claimed', async () => {
    const store = createMemoryFileStore();
    const r = await processUpload({ ...base, filename: 'chart.exe' }, { store, ownsConversation: owns() });
    expect(r).toMatchObject({ ok: true, file: { mediaType: 'image/png', kind: 'image' } });
  });

  it('rejects empty, oversize, foreign-conversation, unsupported and over-quota uploads', async () => {
    const store = createMemoryFileStore();
    const deps = { store, ownsConversation: owns() };
    expect(await processUpload({ ...base, bytes: new Uint8Array(0) }, deps)).toMatchObject({ ok: false, status: 422 });
    expect(await processUpload({ ...base, bytes: new Uint8Array(MAX_FILE_BYTES + 1) }, deps)).toMatchObject({ ok: false, status: 413 });
    expect(await processUpload(base, { store, ownsConversation: owns(false) })).toMatchObject({ ok: false, status: 404 });
    expect(await processUpload({ ...base, bytes: new TextEncoder().encode('<html>') }, deps)).toMatchObject({ ok: false, status: 415 });

    const full = createMemoryFileStore();
    await full.put({ userId: 'u1', conversationId: 'c1', filename: 'a', mediaType: 'image/png', kind: 'image', bytes: new Uint8Array(MAX_USER_STORAGE_BYTES) });
    expect(await processUpload(base, { store: full, ownsConversation: owns() })).toMatchObject({ ok: false, status: 413 });
    expect(await processUpload({ ...base, userId: 'u2' }, { store: full, ownsConversation: owns() })).toMatchObject({ ok: true });
  });
});

describe('sanitizeUserMessage', () => {
  async function withFile(userId = 'u1', conversationId = 'c1') {
    const store = createMemoryFileStore();
    const f = await store.put({ userId, conversationId, filename: 'q.png', mediaType: 'image/png', kind: 'image', bytes: png() });
    return { store, f };
  }
  const ctx = (store: ReturnType<typeof createMemoryFileStore>) => ({ userId: 'u1', conversationId: 'c1', store });
  const msg = (parts: unknown[], id = 'm1') => ({ id, role: 'user', parts });

  it('accepts text plus own attachments and rebuilds file parts from the stored record', async () => {
    const { store, f } = await withFile();
    const r = await sanitizeUserMessage(
      msg([{ type: 'text', text: ' hello ' }, { type: 'file', url: fileUrl(f.id), mediaType: 'text/html', filename: 'evil.html' }]),
      ctx(store)
    );
    expect(r.ok && r.message.parts).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'file', mediaType: 'image/png', filename: 'q.png', url: fileUrl(f.id) },
    ]);
    expect(r.ok && r.kinds).toEqual(['image']);
  });

  it('allows a file-only message and de-duplicates repeated files', async () => {
    const { store, f } = await withFile();
    const r = await sanitizeUserMessage(msg([{ type: 'file', url: fileUrl(f.id) }, { type: 'file', url: fileUrl(f.id) }]), ctx(store));
    expect(r.ok && r.fileIds).toEqual([f.id]);
  });

  it("rejects someone else's file, another conversation's file, and unknown ids", async () => {
    const theirs = await withFile('u2');
    expect((await sanitizeUserMessage(msg([{ type: 'file', url: fileUrl(theirs.f.id) }]), ctx(theirs.store))).ok).toBe(false);
    const other = await withFile('u1', 'c-other');
    expect((await sanitizeUserMessage(msg([{ type: 'file', url: fileUrl(other.f.id) }]), ctx(other.store))).ok).toBe(false);
    expect((await sanitizeUserMessage(msg([{ type: 'file', url: fileUrl('0'.repeat(24)) }]), ctx(createMemoryFileStore()))).ok).toBe(false);
  });

  it('rejects bad shapes, oversize text, too many files and empty messages', async () => {
    const { store } = await withFile();
    expect((await sanitizeUserMessage({ id: 'x', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] }, ctx(store))).ok).toBe(false);
    expect((await sanitizeUserMessage(msg([{ type: 'text', text: 'x'.repeat(MAX_MESSAGE_CHARS + 1) }]), ctx(store))).ok).toBe(false);
    expect((await sanitizeUserMessage(msg([{ type: 'text', text: '   ' }]), ctx(store))).ok).toBe(false);
    const many = Array.from({ length: MAX_FILES_PER_MESSAGE + 1 }, () => ({ type: 'file', url: fileUrl('0'.repeat(24)) }));
    expect((await sanitizeUserMessage(msg(many), ctx(store))).ok).toBe(false);
    expect((await sanitizeUserMessage(null, ctx(store))).ok).toBe(false);
  });
});
