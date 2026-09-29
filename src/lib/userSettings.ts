import { getDb } from '@/lib/mongodb';
import { decrypt, encrypt } from '@/lib/crypto';

export type AiProvider = 'gemini' | 'anthropic' | 'openrouter';

export interface AiSettings {
  provider: AiProvider;
  /** Decrypted — only ever returned server-side. */
  apiKey: string;
  model: string | null;
  updatedAt: Date;
}

/** What the settings page shows — never the key itself. */
export interface AiSettingsView {
  provider: AiProvider;
  model: string | null;
  /** Last 4 chars, for "…, ends ••••ab12". */
  keyHint: string;
  updatedAt: Date;
}

/** Per-user notification delivery channels (ADR 0028 amendment — alerts §2
 * originally shipped a single operator-wide `ALERT_WEBHOOK_URL`; this lets
 * each user wire their own Slack/Telegram/WhatsApp/custom webhook without
 * redeploying anything). All values are encrypted at rest, same as the BYO
 * AI key above — a webhook URL or bot token is a credential too. */
export interface NotificationChannelSettings {
  slackWebhookUrl: string | null;
  telegramBotToken: string | null;
  /** Not secret on its own (no token attached) — stored in the clear. */
  telegramChatId: string | null;
  whatsappWebhookUrl: string | null;
  customWebhookUrl: string | null;
  updatedAt: Date | null;
}

export interface NotificationChannelSettingsView {
  slack: { configured: boolean };
  telegram: { configured: boolean; chatId: string | null };
  whatsapp: { configured: boolean };
  webhook: { configured: boolean };
  updatedAt: Date | null;
}

interface UserSettingsDoc {
  userId: string;
  aiProvider?: AiProvider;
  aiKeyEnc?: string;
  aiModel?: string | null;
  slackWebhookEnc?: string | null;
  telegramBotTokenEnc?: string | null;
  telegramChatId?: string | null;
  whatsappWebhookEnc?: string | null;
  customWebhookEnc?: string | null;
  channelsUpdatedAt?: Date | null;
  /** Default true (a fresh doc / missing field reads as enabled) — every
   * newly added holding gets a default trailing-stop + drawdown-watch pair
   * unless the user explicitly turns this off. */
  autoGuardrailsEnabled?: boolean;
  updatedAt: Date;
}

async function collection() {
  const db = await getDb();
  return db.collection<UserSettingsDoc>('userSettings');
}

export async function getAiSettings(userId: string): Promise<AiSettings | null> {
  const doc = await (await collection()).findOne({ userId });
  if (!doc?.aiKeyEnc || !doc.aiProvider) return null;
  return {
    provider: doc.aiProvider,
    apiKey: decrypt(doc.aiKeyEnc),
    model: doc.aiModel ?? null,
    updatedAt: doc.updatedAt,
  };
}

export async function getAiSettingsView(userId: string): Promise<AiSettingsView | null> {
  const s = await getAiSettings(userId);
  if (!s) return null;
  return {
    provider: s.provider,
    model: s.model,
    keyHint: s.apiKey.slice(-4),
    updatedAt: s.updatedAt,
  };
}

export async function setAiSettings(
  userId: string,
  input: { provider: AiProvider; apiKey: string; model?: string | null }
): Promise<void> {
  const now = new Date();
  await (await collection()).updateOne(
    { userId },
    {
      $set: {
        aiProvider: input.provider,
        aiKeyEnc: encrypt(input.apiKey),
        aiModel: input.model?.trim() || null,
        updatedAt: now,
      },
      $setOnInsert: { userId },
    },
    { upsert: true }
  );
}

export async function clearAiSettings(userId: string): Promise<void> {
  await (
    await collection()
  ).updateOne(
    { userId },
    { $unset: { aiProvider: '', aiKeyEnc: '', aiModel: '' }, $set: { updatedAt: new Date() } }
  );
}

// --- Notification channels -------------------------------------------------

export async function getNotificationChannelSettings(userId: string): Promise<NotificationChannelSettings> {
  const doc = await (await collection()).findOne({ userId });
  return {
    slackWebhookUrl: doc?.slackWebhookEnc ? decrypt(doc.slackWebhookEnc) : null,
    telegramBotToken: doc?.telegramBotTokenEnc ? decrypt(doc.telegramBotTokenEnc) : null,
    telegramChatId: doc?.telegramChatId ?? null,
    whatsappWebhookUrl: doc?.whatsappWebhookEnc ? decrypt(doc.whatsappWebhookEnc) : null,
    customWebhookUrl: doc?.customWebhookEnc ? decrypt(doc.customWebhookEnc) : null,
    updatedAt: doc?.channelsUpdatedAt ?? null,
  };
}

export async function getNotificationChannelSettingsView(
  userId: string
): Promise<NotificationChannelSettingsView> {
  const s = await getNotificationChannelSettings(userId);
  return {
    slack: { configured: Boolean(s.slackWebhookUrl) },
    telegram: { configured: Boolean(s.telegramBotToken && s.telegramChatId), chatId: s.telegramChatId },
    whatsapp: { configured: Boolean(s.whatsappWebhookUrl) },
    webhook: { configured: Boolean(s.customWebhookUrl) },
    updatedAt: s.updatedAt,
  };
}

export interface NotificationChannelInput {
  /** Present + non-empty → set/replace. Present + empty string → clear.
   * Absent → leave untouched. */
  slackWebhookUrl?: string;
  telegramBotToken?: string;
  telegramChatId?: string;
  whatsappWebhookUrl?: string;
  customWebhookUrl?: string;
}

export async function setNotificationChannels(userId: string, input: NotificationChannelInput): Promise<void> {
  const set: Partial<UserSettingsDoc> = { channelsUpdatedAt: new Date(), updatedAt: new Date() };
  const unset: Record<string, ''> = {};

  if (input.slackWebhookUrl !== undefined) {
    if (input.slackWebhookUrl.trim()) set.slackWebhookEnc = encrypt(input.slackWebhookUrl.trim());
    else unset.slackWebhookEnc = '';
  }
  if (input.telegramBotToken !== undefined) {
    if (input.telegramBotToken.trim()) set.telegramBotTokenEnc = encrypt(input.telegramBotToken.trim());
    else unset.telegramBotTokenEnc = '';
  }
  if (input.telegramChatId !== undefined) {
    set.telegramChatId = input.telegramChatId.trim() || null;
  }
  if (input.whatsappWebhookUrl !== undefined) {
    if (input.whatsappWebhookUrl.trim()) set.whatsappWebhookEnc = encrypt(input.whatsappWebhookUrl.trim());
    else unset.whatsappWebhookEnc = '';
  }
  if (input.customWebhookUrl !== undefined) {
    if (input.customWebhookUrl.trim()) set.customWebhookEnc = encrypt(input.customWebhookUrl.trim());
    else unset.customWebhookEnc = '';
  }

  const update: Record<string, unknown> = { $set: set, $setOnInsert: { userId } };
  if (Object.keys(unset).length > 0) update.$unset = unset;

  await (await collection()).updateOne({ userId }, update, { upsert: true });
}

// --- Auto-guardrail alerts --------------------------------------------------

/** Whether newly added holdings should get default guardrail alerts
 * (trailing stop + cumulative drawdown watch) created automatically. On by
 * default — a missing/absent field reads as enabled, not disabled, so
 * existing users get the protection without having to opt in. */
export async function getAutoGuardrailsEnabled(userId: string): Promise<boolean> {
  const doc = await (await collection()).findOne({ userId });
  return doc?.autoGuardrailsEnabled ?? true;
}

export async function setAutoGuardrailsEnabled(userId: string, enabled: boolean): Promise<void> {
  await (
    await collection()
  ).updateOne(
    { userId },
    { $set: { autoGuardrailsEnabled: enabled, updatedAt: new Date() }, $setOnInsert: { userId } },
    { upsert: true }
  );
}

export async function clearNotificationChannel(
  userId: string,
  channel: 'slack' | 'telegram' | 'whatsapp' | 'webhook'
): Promise<void> {
  const unset: Record<string, ''> = { channel: '' };
  delete unset.channel;
  if (channel === 'slack') unset.slackWebhookEnc = '';
  if (channel === 'telegram') {
    unset.telegramBotTokenEnc = '';
    unset.telegramChatId = '';
  }
  if (channel === 'whatsapp') unset.whatsappWebhookEnc = '';
  if (channel === 'webhook') unset.customWebhookEnc = '';

  await (
    await collection()
  ).updateOne({ userId }, { $unset: unset, $set: { channelsUpdatedAt: new Date(), updatedAt: new Date() } });
}
