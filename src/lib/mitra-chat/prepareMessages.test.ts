import { describe, expect, it } from 'vitest';
import { convertToModelMessages, type UIMessage } from 'ai';
import { createMemoryFileStore } from './memoryFileStore';
import { fileIdFromUrl, fileUrl, prepareModelMessages, transcriptOf } from './prepareMessages';
import { buildSummaryPrompt } from './summarize';
import { INLINE_ATTACHMENT_BYTE_BUDGET, INLINE_ATTACHMENT_MESSAGES } from './limits';

const enc = (s: string) => new TextEncoder().encode(s);
const text = (role: 'user' | 'assistant', t: string, id = t): UIMessage => ({ id, role, parts: [{ type: 'text', text: t }] });

async function setup() {
  const store = createMemoryFileStore();
  const put = (filename: string, mediaType: string, kind: 'image' | 'pdf' | 'audio' | 'text', bytes: Uint8Array, userId = 'u1') =>
    store.put({ userId, conversationId: 'c1', filename, mediaType, kind, bytes });
  const withFile = (f: { id: string; filename: string; mediaType: string }, t = 'see this', id = `m-${f.id}`): UIMessage => ({
    id,
    role: 'user',
    parts: [
      { type: 'text', text: t },
      { type: 'file', mediaType: f.mediaType, filename: f.filename, url: fileUrl(f.id) },
    ],
  });
  return { store, put, withFile };
}

describe('fileIdFromUrl', () => {
  it('accepts only our own file URLs', () => {
    expect(fileIdFromUrl('/api/mitra/files/0123456789abcdef01234567')).toBe('0123456789abcdef01234567');
    expect(fileIdFromUrl('https://evil.example/api/mitra/files/0123456789abcdef01234567')).toBeNull();
    expect(fileIdFromUrl('/api/mitra/files/../../etc/passwd')).toBeNull();
    expect(fileIdFromUrl('data:text/plain;base64,AAAA')).toBeNull();
  });
});

describe('prepareModelMessages', () => {
  it('inlines a recent attachment as bytes the SDK turns into a file part', async () => {
    const { store, put, withFile } = await setup();
    const f = await put('r.pdf', 'application/pdf', 'pdf', enc('%PDF-1.7 hello'));
    const prepared = await prepareModelMessages([withFile(f)], { store, userId: 'u1' });
    const model = await convertToModelMessages(prepared);
    const content = model[0].content as Array<{ type: string; mediaType?: string }>;
    expect(content.find((c) => c.type === 'file')?.mediaType).toBe('application/pdf');
  });

  it('inlines text files as text and never forwards the file reference', async () => {
    const { store, put, withFile } = await setup();
    const f = await put('t.csv', 'text/csv', 'text', enc('a,b\n1,2'));
    const [m] = await prepareModelMessages([withFile(f)], { store, userId: 'u1' });
    expect(m.parts.every((p) => p.type === 'text')).toBe(true);
    expect(JSON.stringify(m.parts)).toContain('a,b');
  });

  it('replaces attachments beyond the newest few user turns with a placeholder', async () => {
    const { store, put, withFile } = await setup();
    const files = [];
    for (let i = 0; i < INLINE_ATTACHMENT_MESSAGES + 1; i++) files.push(await put(`f${i}.png`, 'image/png', 'image', enc('x')));
    const messages = files.flatMap((f, i) => [withFile(f, `q${i}`, `u${i}`), text('assistant', `a${i}`)]);
    const prepared = await prepareModelMessages(messages, { store, userId: 'u1' });
    expect(JSON.stringify(prepared[0].parts)).toContain('no longer in context');
    expect(prepared.at(-2)!.parts.some((p) => p.type === 'file')).toBe(true);
  });

  it("never reads another user's file, and tolerates a missing one", async () => {
    const { store, put, withFile } = await setup();
    const theirs = await put('s.png', 'image/png', 'image', enc('x'), 'someone-else');
    const [m] = await prepareModelMessages([withFile(theirs)], { store, userId: 'u1' });
    expect(m.parts.some((p) => p.type === 'file')).toBe(false);
    expect(JSON.stringify(m.parts)).toContain('no longer available');
  });

  it('uses a placeholder for kinds the current model cannot read', async () => {
    const { store, put, withFile } = await setup();
    const clip = await put('call.mp3', 'audio/mpeg', 'audio', enc('ID3....'));
    const [m] = await prepareModelMessages([withFile(clip)], { store, userId: 'u1', canRead: (k) => k !== 'audio' });
    expect(m.parts.some((p) => p.type === 'file')).toBe(false);
    expect(JSON.stringify(m.parts)).toContain('cannot be read by the model');
  });

  it('respects the byte budget', async () => {
    const { store, put, withFile } = await setup();
    const big = await put('big.png', 'image/png', 'image', new Uint8Array(INLINE_ATTACHMENT_BYTE_BUDGET + 1));
    const [m] = await prepareModelMessages([withFile(big)], { store, userId: 'u1' });
    expect(JSON.stringify(m.parts)).toContain('too large');
  });

  it('drops tool parts from older turns but keeps them in the last two messages', async () => {
    const tool = { type: 'tool-search_context', toolCallId: 't', state: 'output-available', input: {}, output: {} } as unknown as UIMessage['parts'][number];
    const old: UIMessage = { id: 'o', role: 'assistant', parts: [tool, { type: 'text', text: 'old answer' }] };
    const recent: UIMessage = { id: 'r', role: 'assistant', parts: [tool, { type: 'text', text: 'new answer' }] };
    const { store } = await setup();
    const out = await prepareModelMessages([text('user', 'q1'), old, text('user', 'q2'), recent], { store, userId: 'u1' });
    expect(out.find((m) => m.id === 'o')!.parts).toHaveLength(1);
    expect(out.find((m) => m.id === 'r')!.parts).toHaveLength(2);
  });

  it('removes messages that end up empty', async () => {
    const tool = { type: 'tool-x', toolCallId: 't', state: 'output-available', input: {}, output: {} } as unknown as UIMessage['parts'][number];
    const toolOnly: UIMessage = { id: 't', role: 'assistant', parts: [tool] };
    const { store } = await setup();
    const out = await prepareModelMessages([text('user', 'a'), toolOnly, text('user', 'b'), text('assistant', 'c'), text('user', 'd')], { store, userId: 'u1' });
    expect(out.map((m) => m.id)).not.toContain('t');
  });
});

describe('transcriptOf / buildSummaryPrompt', () => {
  const convo = [text('user', 'Hold HDFC Bank?'), { id: 'f', role: 'user', parts: [{ type: 'file', mediaType: 'application/pdf', filename: 'ar.pdf', url: '/x' }] } as UIMessage];

  it('renders speakers and attachment names, skipping empty messages', () => {
    expect(transcriptOf(convo)).toBe('User: Hold HDFC Bank?\nUser: [attached: ar.pdf]');
  });

  it('includes the existing summary only when there is one', () => {
    expect(buildSummaryPrompt('', convo)).not.toContain('Existing summary');
    expect(buildSummaryPrompt('Owns 10 TCS', convo)).toContain('Existing summary:\nOwns 10 TCS');
  });
});
