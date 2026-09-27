import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPayload } from './types';

const send = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
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

describe('sendWebhook', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('POSTs the generic payload shape and reports "sent"', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const r = await sendWebhook('https://example.com/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'sent' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.com/hook');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      kind: 'alert',
      title: payload.title,
      body: payload.body,
      href: payload.href,
      meta: {},
    });
  });

  it('maps a non-2xx response to "error"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const r = await sendWebhook('https://example.com/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'error', detail: 'HTTP 500' });
  });

  it('catches a network throw', async () => {
    fetchMock.mockRejectedValue(new Error('timeout'));
    const r = await sendWebhook('https://example.com/hook', payload);
    expect(r).toEqual({ channel: 'webhook', status: 'error', detail: 'timeout' });
  });
});

describe('sendSlack', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('POSTs a Slack-shaped {text} payload and reports "sent"', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const r = await sendSlack('https://hooks.slack.com/services/x', payload);
    expect(r).toEqual({ channel: 'slack', status: 'sent' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/services/x');
    const body = JSON.parse(init.body);
    expect(body.text).toContain(payload.title);
    expect(body.text).toContain(payload.body);
    expect(body.text).toContain('/dashboard/stock/RELIANCE');
  });

  it('maps a non-2xx response to "error" with the response body as detail', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, text: async () => 'invalid_payload' });
    const r = await sendSlack('https://hooks.slack.com/services/x', payload);
    expect(r).toEqual({ channel: 'slack', status: 'error', detail: 'invalid_payload' });
  });
});

describe('sendTelegram', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('POSTs to the Bot API sendMessage endpoint with chat_id + text', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const r = await sendTelegram('123:abc', '456', payload);
    expect(r).toEqual({ channel: 'telegram', status: 'sent' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/bot123:abc/sendMessage');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('456');
    expect(body.parse_mode).toBe('Markdown');
    expect(body.text).toContain('RELIANCE crossed');
  });

  it('escapes Telegram markdown special characters in title/body', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await sendTelegram('123:abc', '456', { ...payload, title: '[TCS] up_down*move' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toContain('\\[TCS\\] up\\_down\\*move');
  });

  it('maps a non-2xx response to "error"', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });
    const r = await sendTelegram('bad-token', '456', payload);
    expect(r).toEqual({ channel: 'telegram', status: 'error', detail: 'Unauthorized' });
  });
});

describe('sendWhatsapp', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  it('relays through the generic webhook shape, tagged as the whatsapp channel', async () => {
    fetchMock.mockResolvedValue({ ok: true });
    const r = await sendWhatsapp('https://example.com/relay', payload);
    expect(r).toEqual({ channel: 'whatsapp', status: 'sent' });
  });

  it('surfaces a relay failure as the whatsapp channel', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    const r = await sendWhatsapp('https://example.com/relay', payload);
    expect(r).toEqual({ channel: 'whatsapp', status: 'error', detail: 'HTTP 500' });
  });
});
