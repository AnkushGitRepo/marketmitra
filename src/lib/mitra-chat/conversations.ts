import { ObjectId } from 'mongodb';
import type { UIMessage } from 'ai';
import { getDb } from '@/lib/mongodb';
import {
  DEFAULT_TITLE,
  MAX_CONVERSATIONS_PER_USER,
  MAX_MESSAGES_PER_CONVERSATION,
  SUMMARY_MAX_CHARS,
  TITLE_MAX,
} from './limits';
import { makeTitle } from './title';
import type { Conversation } from './types';

interface ConversationDoc {
  _id: ObjectId;
  userId: string;
  title: string;
  titleSource: 'auto' | 'user';
  messageCount: number;
  summary: string;
  summarizedThrough: number;
  createdAt: Date;
  updatedAt: Date;
}

interface MessageDoc {
  _id?: ObjectId;
  userId: string;
  conversationId: string;
  seq: number;
  message: UIMessage;
  createdAt: Date;
}

interface LegacyChatDoc {
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: Date;
}

const toConversation = (d: ConversationDoc): Conversation => ({
  id: d._id.toString(),
  title: d.title,
  titleSource: d.titleSource,
  messageCount: d.messageCount,
  summary: d.summary,
  summarizedThrough: d.summarizedThrough,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

async function cols() {
  const db = await getDb();
  return {
    conversations: db.collection<ConversationDoc>('mitraConversations'),
    messages: db.collection<MessageDoc>('mitraMessages'),
    legacy: db.collection<LegacyChatDoc>('chatMessages'),
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function normaliseTitle(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX);
}

/** Creates a conversation, or null once the per-user cap is reached. */
export async function createConversation(userId: string, title?: string): Promise<Conversation | null> {
  const { conversations } = await cols();
  if ((await conversations.countDocuments({ userId })) >= MAX_CONVERSATIONS_PER_USER) return null;
  const now = new Date();
  const clean = title ? normaliseTitle(title) : '';
  const doc: ConversationDoc = {
    _id: new ObjectId(),
    userId,
    title: clean || DEFAULT_TITLE,
    titleSource: clean ? 'user' : 'auto',
    messageCount: 0,
    summary: '',
    summarizedThrough: 0,
    createdAt: now,
    updatedAt: now,
  };
  await conversations.insertOne(doc);
  return toConversation(doc);
}

export async function listConversations(userId: string, query?: string, limit = 100): Promise<Conversation[]> {
  const { conversations } = await cols();
  const q = query?.trim().slice(0, 80);
  const filter = q ? { userId, title: { $regex: escapeRegex(q), $options: 'i' } } : { userId };
  const docs = await conversations.find(filter).sort({ updatedAt: -1 }).limit(limit).toArray();
  return docs.map(toConversation);
}

export async function getConversation(userId: string, id: string): Promise<Conversation | null> {
  if (!ObjectId.isValid(id)) return null;
  const { conversations } = await cols();
  const doc = await conversations.findOne({ _id: new ObjectId(id), userId });
  return doc ? toConversation(doc) : null;
}

export async function renameConversation(userId: string, id: string, title: string): Promise<Conversation | null> {
  const clean = normaliseTitle(title);
  if (!clean || !ObjectId.isValid(id)) return null;
  const { conversations } = await cols();
  const doc = await conversations.findOneAndUpdate(
    { _id: new ObjectId(id), userId },
    { $set: { title: clean, titleSource: 'user', updatedAt: new Date() } },
    { returnDocument: 'after' }
  );
  return doc ? toConversation(doc) : null;
}

/** Deletes the conversation and its messages; the caller removes its files. */
export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  if (!ObjectId.isValid(id)) return false;
  const { conversations, messages } = await cols();
  const res = await conversations.deleteOne({ _id: new ObjectId(id), userId });
  if (!res.deletedCount) return false;
  await messages.deleteMany({ userId, conversationId: id });
  return true;
}

export async function loadMessages(userId: string, conversationId: string): Promise<UIMessage[]> {
  const { messages } = await cols();
  const docs = await messages
    .find({ userId, conversationId })
    .sort({ seq: 1 })
    .limit(MAX_MESSAGES_PER_CONVERSATION)
    .toArray();
  return docs.map((d) => d.message);
}

function firstUserText(messages: readonly UIMessage[]): string {
  const user = messages.find((m) => m.role === 'user');
  return (
    user?.parts
      .filter((p): p is Extract<UIMessage['parts'][number], { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join(' ') ?? ''
  );
}

/** Appends messages in order; auto-titles a fresh conversation from its first user message. */
export async function appendMessages(
  userId: string,
  conversationId: string,
  newMessages: readonly UIMessage[]
): Promise<boolean> {
  if (newMessages.length === 0 || !ObjectId.isValid(conversationId)) return false;
  const { conversations, messages } = await cols();
  const _id = new ObjectId(conversationId);
  const before = await conversations.findOneAndUpdate(
    { _id, userId, messageCount: { $lte: MAX_MESSAGES_PER_CONVERSATION - newMessages.length } },
    { $inc: { messageCount: newMessages.length }, $set: { updatedAt: new Date() } },
    { returnDocument: 'before' }
  );
  if (!before) return false;

  const now = Date.now();
  await messages.insertMany(
    newMessages.map((message, i) => ({
      userId,
      conversationId,
      seq: before.messageCount + i,
      message,
      createdAt: new Date(now + i),
    }))
  );

  if (before.titleSource === 'auto' && before.title === DEFAULT_TITLE) {
    const text = firstUserText(newMessages);
    if (text.trim()) await conversations.updateOne({ _id, userId }, { $set: { title: makeTitle(text) } });
  }
  return true;
}

export async function saveSummary(
  userId: string,
  conversationId: string,
  summary: string,
  summarizedThrough: number
): Promise<void> {
  if (!ObjectId.isValid(conversationId)) return;
  const { conversations } = await cols();
  await conversations.updateOne(
    { _id: new ObjectId(conversationId), userId },
    { $set: { summary: summary.slice(0, SUMMARY_MAX_CHARS), summarizedThrough } }
  );
}

/**
 * One-time carry-over of the widget's single thread (`chatMessages`) into a first
 * conversation, so history isn't lost when the full chat page ships. Runs only for
 * a user with no conversations yet; returns the created conversation or null.
 */
export async function migrateLegacyThread(userId: string): Promise<Conversation | null> {
  const { conversations, legacy } = await cols();
  if ((await conversations.countDocuments({ userId })) > 0) return null;
  const rows = await legacy.find({ userId }).sort({ createdAt: 1 }).toArray();
  if (rows.length === 0) return null;
  const created = await createConversation(userId, 'Earlier chat');
  if (!created) return null;
  const converted: UIMessage[] = rows.map((r, i) => ({
    id: `legacy-${i}`,
    role: r.role,
    parts: [{ type: 'text', text: r.content }],
  }));
  await appendMessages(userId, created.id, converted);
  return getConversation(userId, created.id);
}
