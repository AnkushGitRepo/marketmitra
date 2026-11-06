import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutboundBlockedError } from '@/lib/security/outbound';
import type { NotificationPayload } from './types';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

// Outbound delivery goes through the SSRF-guarded client; mock just the network
// call and keep the real validation helpers/error types.
const safeFetch = vi.fn();
vi.mock('@/lib/security/outbound', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/security/outbound')>()),
  safeOutboundFetch: (...args: unknown[]) => safeFetch(...args),
}));

const { sendEmail, sendSlack, sendTelegram, sendWebhook, sendWhatsapp } = await import('./channels');

const payload: NotificationPayload = {
  kind: 'alert',
  title: 'RELIANCE crossed ₹2,500',
  body: 'Your "above ₹2,500" alert fired. Last price ₹2,512.',
  href: '/dashboard/stock/RELIANCE',
};

beforeEach(() => {
  send.mockReset();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendEmail', () => {
  it('is a no-op "skipped" when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const r = await sendEmail('u@example.com', payload);
    expect(r).toEqual({ channel: 'email', status: 'skipped', detail: 'no email provider configured' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sends via Resend and reports "sent"', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    send.mockResolvedValue({ data: { id: 'e_1' }, error: null });

    const r = await sendEmail('u@example.com', payload);
    expect(r).toEqual({ channel: 'email', status: 'sent' });

    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe('u@example.com');
    expect(arg.subject).toBe('[MarketMitra] RELIANCE crossed ₹2,500');
    expect(arg.from).toContain('onboarding@resend.dev'); // default when ALERT_EMAIL_FROM unset
    expect(arg.text).toContain('/dashboard/stock/RELIANCE');
    expect(arg.text).toContain('Not investment advice');
    expect(arg.html).toContain('Open MarketMitra');
  });

  it('honours ALERT_EMAIL_FROM', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.stubEnv('ALERT_EMAIL_FROM', 'MarketMitra <alerts@marketmitra.app>');
    send.mockResolvedValue({ data: { id: 'e_2' }, error: null });
    await sendEmail('u@example.com', payload);
    expect(send.mock.calls[0][0].from).toBe('MarketMitra <alerts@marketmitra.app>');
  });

  it('maps a provider error to "error", never throws', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    send.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    const r = await sendEmail('u@example.com', payload);
    expect(r).toEqual({ channel: 'email', status: 'error', detail: 'domain not verified' });
  });

  it('catches an SDK throw', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    send.mockRejectedValue(new Error('network down'));
    const r = await sendEmail('u@example.com', payload);
    expect(r).toEqual({ channel: 'email', status: 'error', detail: 'network down' });
  });

  it('escapes HTML in the payload', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    send.mockResolvedValue({ data: { id: 'e_3' }, error: null });
    await sendEmail('u@example.com', { ...payload, title: '<script>x</script> & "co"' });
    const html = send.mock.calls[0][0].html as string;
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>x</script>');
  });
});

const ok = () => ({ ok: true, status: 200, body: { cancel: async () => {} } });
const fail = (status: number) => ({ ok: false, status, body: { cancel: async () => {} } });
const sentBody = () => JSON.parse(safeFetch.mock.calls[0][1].body);

describe('sendWebhook', () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it('POSTs the generic payload shape and reports "sent"', async () => {
    safeFetch.mockResolvedValue(ok());
    const r = await sendWebhook('https://example.com/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'sent' });
    const [url] = safeFetch.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    expect(sentBody()).toEqual({
      kind: 'alert',
      title: payload.title,
      body: payload.body,
      href: payload.href,
      meta: {},
    });
  });

  it('applies the SSRF guard: https + public hosts only when hosted', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    safeFetch.mockResolvedValue(ok());
    await sendWebhook('https://example.com/hook', payload);
    expect(safeFetch.mock.calls[0][2]).toMatchObject({ allowHttp: false, allowPrivate: false });
  });

  it('lets a self-hoster target their own http://localhost automation', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'selfhost');
    safeFetch.mockResolvedValue(ok());
    await sendWebhook('http://localhost:5678/hook', payload);
    expect(safeFetch.mock.calls[0][2]).toMatchObject({ allowHttp: true, allowPrivate: true });
  });

  it('maps a non-2xx response to "error"', async () => {
    safeFetch.mockResolvedValue(fail(500));
    const r = await sendWebhook('https://example.com/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'error', detail: 'HTTP 500' });
  });

  it('reports a blocked URL with the guard\'s safe reason', async () => {
    safeFetch.mockRejectedValue(new OutboundBlockedError('URL must not point at a private or local address'));
    const r = await sendWebhook('https://10.0.0.1/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'error', detail: 'URL must not point at a private or local address' });
  });

  it('hides raw network errors so a user cannot probe internal hosts', async () => {
    safeFetch.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.7:6379'));
    const r = await sendWebhook('https://example.com/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'error', detail: 'Could not reach the URL' });
  });
});

describe('sendSlack', () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it('POSTs a Slack-shaped {text} payload and reports "sent"', async () => {
    safeFetch.mockResolvedValue(ok());
    const r = await sendSlack('https://hooks.slack.com/services/x', payload);
    expect(r).toEqual({ channel: 'slack', status: 'sent' });
    expect(safeFetch.mock.calls[0][0]).toBe('https://hooks.slack.com/services/x');
    const body = sentBody();
    expect(body.text).toContain(payload.title);
    expect(body.text).toContain(payload.body);
    expect(body.text).toContain('/dashboard/stock/RELIANCE');
  });

  it('pins Slack to hooks.slack.com when hosted', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEPLOYMENT_MODE', 'hosted');
    safeFetch.mockResolvedValue(ok());
    await sendSlack('https://hooks.slack.com/services/x', payload);
    expect(safeFetch.mock.calls[0][2].allowedHosts).toEqual(['hooks.slack.com']);
  });

  it('reports only the status code on failure — never the response body', async () => {
    safeFetch.mockResolvedValue({ ...fail(404), text: async () => 'internal-service-secret' });
    const r = await sendSlack('https://hooks.slack.com/services/x', payload);
    expect(r).toEqual({ channel: 'slack', status: 'error', detail: 'HTTP 404' });
  });
});

describe('sendTelegram', () => {
  const TOKEN = '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw';
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it('POSTs to the Bot API sendMessage endpoint with chat_id + text', async () => {
    safeFetch.mockResolvedValue(ok());
    const r = await sendTelegram(TOKEN, '456', payload);
    expect(r).toEqual({ channel: 'telegram', status: 'sent' });
    expect(safeFetch.mock.calls[0][0]).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = sentBody();
    expect(body.chat_id).toBe('456');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toContain('RELIANCE crossed');
    expect(safeFetch.mock.calls[0][2].allowedHosts).toEqual(['api.telegram.org']);
  });

  it('escapes Telegram markdown special characters in title/body', async () => {
    safeFetch.mockResolvedValue(ok());
    await sendTelegram(TOKEN, '456', { ...payload, title: '[TCS] up_down*move' });
    expect(sentBody().text).toContain('\\[TCS\\] up\\_down\\*move');
  });

  it('maps a non-2xx response to "error" with just the status', async () => {
    safeFetch.mockResolvedValue({ ...fail(401), text: async () => 'Unauthorized' });
    const r = await sendTelegram(TOKEN, '456', payload);
    expect(r).toEqual({ channel: 'telegram', status: 'error', detail: 'HTTP 401' });
  });

  it('rejects a malformed token or chat id without making a request', async () => {
    for (const [token, chat] of [
      ['bad-token', '456'],
      [`${TOKEN}/../x`, '456'],
      [TOKEN, '456; drop'],
    ]) {
      const r = await sendTelegram(token, chat, payload);
      expect(r).toEqual({ channel: 'telegram', status: 'error', detail: 'Invalid Telegram bot token or chat id format' });
    }
    expect(safeFetch).not.toHaveBeenCalled();
  });
});

describe('sendWhatsapp', () => {
  beforeEach(() => {
    safeFetch.mockReset();
  });

  it('relays through the generic webhook shape, tagged as the whatsapp channel', async () => {
    safeFetch.mockResolvedValue(ok());
    const r = await sendWhatsapp('https://example.com/relay', payload);
    expect(r).toEqual({ channel: 'whatsapp', status: 'sent' });
  });

  it('surfaces a relay failure as the whatsapp channel', async () => {
    safeFetch.mockResolvedValue(fail(500));
    const r = await sendWhatsapp('https://example.com/relay', payload);
    expect(r).toEqual({ channel: 'whatsapp', status: 'error', detail: 'HTTP 500' });
  });
});
