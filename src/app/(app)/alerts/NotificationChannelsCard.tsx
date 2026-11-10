'use client';

import { useState } from 'react';
import type { NotificationChannelSettingsView } from '@/lib/userSettings';
import styles from './NotificationChannelsCard.module.css';

interface Props {
  initialView: NotificationChannelSettingsView | null;
  encConfigured: boolean;
}

type ChannelKey = 'slack' | 'telegram' | 'whatsapp' | 'webhook';

interface Drafts {
  slackWebhookUrl: string;
  telegramBotToken: string;
  telegramChatId: string;
  whatsappWebhookUrl: string;
  customWebhookUrl: string;
}

const EMPTY_DRAFTS: Drafts = {
  slackWebhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
  whatsappWebhookUrl: '',
  customWebhookUrl: '',
};

type TestState = { status: 'idle' | 'sending' | 'sent' | 'error'; detail?: string };

export function NotificationChannelsCard({ initialView, encConfigured }: Props) {
  const [view, setView] = useState(initialView);
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [busy, setBusy] = useState<ChannelKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<Partial<Record<ChannelKey, TestState>>>({});

  const save = async (channel: ChannelKey, body: Partial<Drafts>) => {
    setBusy(channel);
    setError(null);
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        data?: NotificationChannelSettingsView;
        error?: string;
      } | null;
      if (!res.ok || !data?.data) {
        setError(data?.error ?? 'Could not save that channel.');
        return;
      }
      setView(data.data);
      setDrafts(EMPTY_DRAFTS);
      setTestState((prev) => ({ ...prev, [channel]: undefined }));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = (channel: ChannelKey) => {
    const clearBody: Partial<Drafts> =
      channel === 'telegram'
        ? { telegramBotToken: '', telegramChatId: '' }
        : channel === 'slack'
          ? { slackWebhookUrl: '' }
          : channel === 'whatsapp'
            ? { whatsappWebhookUrl: '' }
            : { customWebhookUrl: '' };
    void save(channel, clearBody);
  };

  const runTest = async (channel: ChannelKey) => {
    setTestState((prev) => ({ ...prev, [channel]: { status: 'sending' } }));
    try {
      const res = await fetch('/api/settings/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const data = (await res.json().catch(() => null)) as {
        data?: { status: string; detail?: string };
        error?: string;
      } | null;
      if (!res.ok || !data?.data) {
        setTestState((prev) => ({ ...prev, [channel]: { status: 'error', detail: data?.error } }));
        return;
      }
      if (data.data.status === 'sent') {
        setTestState((prev) => ({ ...prev, [channel]: { status: 'sent' } }));
      } else {
        setTestState((prev) => ({ ...prev, [channel]: { status: 'error', detail: data.data!.detail } }));
      }
    } catch {
      setTestState((prev) => ({ ...prev, [channel]: { status: 'error', detail: 'Request failed.' } }));
    }
  };

  const testLabel = (channel: ChannelKey) => {
    const t = testState[channel];
    if (!t || t.status === 'idle') return 'Send test';
    if (t.status === 'sending') return 'Sending…';
    if (t.status === 'sent') return 'Sent ✓';
    return t.detail ? `Failed: ${t.detail.slice(0, 60)}` : 'Failed';
  };

  if (!encConfigured) {
    return (
      <div className={styles.card}>
        <p className={styles.title}>Notification channels</p>
        <p className={styles.disabledNote}>
          This deployment has no <code>SETTINGS_ENC_KEY</code> configured, so channel settings can&rsquo;t be
          stored securely — ask the operator to set one (same requirement as the AI key in Settings).
        </p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <button type="button" className={styles.headerRow} onClick={() => setOpen((o) => !o)}>
        <div>
          <p className={styles.title}>Notification channels</p>
          <p className={styles.subtitle}>
            In-app is always on. Connect Slack, Telegram, WhatsApp, or a custom webhook to also get
            alerts there.
          </p>
        </div>
        <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          {error && <p className={styles.error}>{error}</p>}

          {/* Slack */}
          <div className={styles.channelRow}>
            <div className={styles.channelHead}>
              <p className={styles.channelName}>Slack</p>
              <span className={`${styles.status} ${view?.slack.configured ? styles.statusOn : ''}`}>
                {view?.slack.configured ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p className={styles.channelHelp}>
              Create an{' '}
              <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noreferrer">
                incoming webhook
              </a>{' '}
              for a channel and paste its URL.
            </p>
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                placeholder="https://hooks.slack.com/services/…"
                value={drafts.slackWebhookUrl}
                onChange={(e) => setDrafts({ ...drafts, slackWebhookUrl: e.target.value })}
              />
              <button
                type="button"
                className={styles.smallBtnPrimary}
                disabled={busy === 'slack' || !drafts.slackWebhookUrl.trim()}
                onClick={() => save('slack', { slackWebhookUrl: drafts.slackWebhookUrl })}
              >
                Save
              </button>
              {view?.slack.configured && (
                <>
                  <button type="button" className={styles.smallBtn} onClick={() => runTest('slack')}>
                    {testLabel('slack')}
                  </button>
                  <button type="button" className={styles.smallBtnDanger} onClick={() => disconnect('slack')}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Telegram */}
          <div className={styles.channelRow}>
            <div className={styles.channelHead}>
              <p className={styles.channelName}>Telegram</p>
              <span className={`${styles.status} ${view?.telegram.configured ? styles.statusOn : ''}`}>
                {view?.telegram.configured ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p className={styles.channelHelp}>
              Message{' '}
              <a href="https://t.me/BotFather" target="_blank" rel="noreferrer">
                @BotFather
              </a>{' '}
              for a bot token, message your new bot once, then read your chat id from{' '}
              <code>api.telegram.org/bot&lt;token&gt;/getUpdates</code>.
            </p>
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                placeholder="Bot token"
                value={drafts.telegramBotToken}
                onChange={(e) => setDrafts({ ...drafts, telegramBotToken: e.target.value })}
              />
              <input
                className={`${styles.input} ${styles.narrowInput}`}
                placeholder="Chat id"
                value={drafts.telegramChatId}
                onChange={(e) => setDrafts({ ...drafts, telegramChatId: e.target.value })}
              />
              <button
                type="button"
                className={styles.smallBtnPrimary}
                disabled={busy === 'telegram' || !drafts.telegramBotToken.trim() || !drafts.telegramChatId.trim()}
                onClick={() =>
                  save('telegram', {
                    telegramBotToken: drafts.telegramBotToken,
                    telegramChatId: drafts.telegramChatId,
                  })
                }
              >
                Save
              </button>
              {view?.telegram.configured && (
                <>
                  <button type="button" className={styles.smallBtn} onClick={() => runTest('telegram')}>
                    {testLabel('telegram')}
                  </button>
                  <button type="button" className={styles.smallBtnDanger} onClick={() => disconnect('telegram')}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
            {view?.telegram.configured && view.telegram.chatId && (
              <p className={styles.channelMeta}>Chat id: {view.telegram.chatId}</p>
            )}
          </div>

          {/* WhatsApp */}
          <div className={styles.channelRow}>
            <div className={styles.channelHead}>
              <p className={styles.channelName}>WhatsApp</p>
              <span className={`${styles.status} ${view?.whatsapp.configured ? styles.statusOn : ''}`}>
                {view?.whatsapp.configured ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p className={styles.channelHelp}>
              There&rsquo;s no free, keyless WhatsApp API to send to a number directly. Paste a relay
              webhook URL instead — a Twilio Function, a CallMeBot-style relay, or a Zapier/Make
              webhook that forwards to your WhatsApp.
            </p>
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                placeholder="https://…your relay webhook…"
                value={drafts.whatsappWebhookUrl}
                onChange={(e) => setDrafts({ ...drafts, whatsappWebhookUrl: e.target.value })}
              />
              <button
                type="button"
                className={styles.smallBtnPrimary}
                disabled={busy === 'whatsapp' || !drafts.whatsappWebhookUrl.trim()}
                onClick={() => save('whatsapp', { whatsappWebhookUrl: drafts.whatsappWebhookUrl })}
              >
                Save
              </button>
              {view?.whatsapp.configured && (
                <>
                  <button type="button" className={styles.smallBtn} onClick={() => runTest('whatsapp')}>
                    {testLabel('whatsapp')}
                  </button>
                  <button type="button" className={styles.smallBtnDanger} onClick={() => disconnect('whatsapp')}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Custom webhook */}
          <div className={styles.channelRow}>
            <div className={styles.channelHead}>
              <p className={styles.channelName}>Custom webhook</p>
              <span className={`${styles.status} ${view?.webhook.configured ? styles.statusOn : ''}`}>
                {view?.webhook.configured ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <p className={styles.channelHelp}>
              Any URL that accepts a POST — Discord incoming webhooks, an automation tool, or your
              own endpoint. Posts <code>{'{ kind, title, body, href, meta }'}</code> as JSON.
            </p>
            <div className={styles.inlineForm}>
              <input
                className={styles.input}
                placeholder="https://…"
                value={drafts.customWebhookUrl}
                onChange={(e) => setDrafts({ ...drafts, customWebhookUrl: e.target.value })}
              />
              <button
                type="button"
                className={styles.smallBtnPrimary}
                disabled={busy === 'webhook' || !drafts.customWebhookUrl.trim()}
                onClick={() => save('webhook', { customWebhookUrl: drafts.customWebhookUrl })}
              >
                Save
              </button>
              {view?.webhook.configured && (
                <>
                  <button type="button" className={styles.smallBtn} onClick={() => runTest('webhook')}>
                    {testLabel('webhook')}
                  </button>
                  <button type="button" className={styles.smallBtnDanger} onClick={() => disconnect('webhook')}>
                    Disconnect
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
