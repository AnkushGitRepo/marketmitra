import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPayload } from './types';

const m = vi.hoisted(() => ({
  insertNotification: vi.fn(async (_u: string, p: unknown) => ({ id: 'n1', ...(p as object) })),
  sendEmail: vi.fn(),
  sendSlack: vi.fn(),
  sendTelegram: vi.fn(),
  sendWebhook: vi.fn(),
  sendWhatsapp: vi.fn(),
  emailConfigured: vi.fn(() => true),
  getEmailAlertSettings: vi.fn(async () => ({ enabled: true, last: null })),
  getNotificationChannelSettings: vi.fn(async () => ({
    slackWebhookUrl: null, telegramBotToken: null, telegramChatId: null, whatsappWebhookUrl: null, customWebhookUrl: null, updatedAt: null,
  })),
  recordAlertEmailResult: vi.fn(async () => {}),
  logEvent: vi.fn(async () => {}),
  isHosted: vi.fn(() => false),
}));

vi.mock('./store', () => ({ insertNotification: m.insertNotification }));
vi.mock('./channels', () => ({
  emailConfigured: m.emailConfigured,
  sendEmail: m.sendEmail,
  sendSlack: m.sendSlack,
  sendTelegram: m.sendTelegram,
  sendWebhook: m.sendWebhook,
  sendWhatsapp: m.sendWhatsapp,
}));
vi.mock('@/lib/userSettings', () => ({
  getEmailAlertSettings: m.getEmailAlertSettings,
  getNotificationChannelSettings: m.getNotificationChannelSettings,
  recordAlertEmailResult: m.recordAlertEmailResult,
}));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: m.logEvent }));
vi.mock('@/lib/deployment-mode', () => ({ isHosted: m.isHosted }));

const { deliverNotification, resolveChannels, resolveEmailRoute } = await import('./deliver');

const payload: NotificationPayload = { kind: 'alert', title: 'TCS crossed ₹3,200', body: 'Your alert fired.', href: '/stock/TCS' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  m.emailConfigured.mockReturnValue(true);
  m.getEmailAlertSettings.mockResolvedValue({ enabled: true, last: null });
  m.isHosted.mockReturnValue(false);
  vi.stubEnv('ALERT_EMAIL_TO', 'me@example.com');
});

describe('a triggered alert emails the user when email alerts are on', () => {
  it('resolves the account address and sends the email, recording a success', async () => {
    m.sendEmail.mockResolvedValue({ channel: 'email', status: 'sent' });
    const channels = await resolveChannels('u1');
    expect(channels.email).toBe('me@example.com');

    const out = await deliverNotification('u1', payload, channels);
    expect(m.sendEmail).toHaveBeenCalledWith('me@example.com', payload);
    expect(out.results.map((r) => [r.channel, r.status])).toEqual([['in_app', 'sent'], ['email', 'sent']]);
    expect(m.recordAlertEmailResult).toHaveBeenCalledWith('u1', { status: 'sent', detail: null });
    expect(m.logEvent).not.toHaveBeenCalled();
  });

  it('does not send, and records why, when the user turned email alerts off', async () => {
    m.getEmailAlertSettings.mockResolvedValue({ enabled: false, last: null });
    const channels = await resolveChannels('u1');
    expect(channels.email).toBe(false);
    expect(channels.emailSkipped).toBe('disabled');

    await deliverNotification('u1', payload, channels);
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.recordAlertEmailResult).toHaveBeenCalledWith('u1', { status: 'skipped', detail: expect.stringMatching(/turned off/i) });
  });

  it('still delivers in-app when the email provider fails, and makes the failure visible', async () => {
    m.sendEmail.mockResolvedValue({ channel: 'email', status: 'error', detail: 'The domain is not verified' });
    const out = await deliverNotification('u1', payload, await resolveChannels('u1'));
    expect(out.results[0]).toEqual({ channel: 'in_app', status: 'sent' });
    expect(out.results[1]).toMatchObject({ channel: 'email', status: 'error' });
    expect(m.recordAlertEmailResult).toHaveBeenCalledWith('u1', { status: 'failed', detail: 'The domain is not verified' });
    expect(m.logEvent).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', source: 'alerts:email', message: expect.stringContaining('m***@example.com') }));
  });

  it('never puts the full address in the system log', async () => {
    m.sendEmail.mockResolvedValue({ channel: 'email', status: 'error', detail: 'boom' });
    await deliverNotification('u1', payload, await resolveChannels('u1'));
    const logged = JSON.stringify(m.logEvent.mock.calls);
    expect(logged).not.toContain('me@example.com');
  });

  it('skips with a reason when the server has no email provider, without calling the address lookup', async () => {
    m.emailConfigured.mockReturnValue(false);
    expect(await resolveEmailRoute('u1')).toEqual({ kind: 'skip', reason: 'provider_missing' });
  });

  it('skips with a reason when no address can be found', async () => {
    vi.stubEnv('ALERT_EMAIL_TO', '');
    expect(await resolveEmailRoute('u1')).toEqual({ kind: 'skip', reason: 'no_address' });
  });

  it('treats a failure to read the setting as "on", so a database hiccup cannot silently drop alert emails', async () => {
    m.getEmailAlertSettings.mockRejectedValue(new Error('mongo down'));
    expect(await resolveEmailRoute('u1')).toEqual({ kind: 'send', to: 'me@example.com' });
  });
});
