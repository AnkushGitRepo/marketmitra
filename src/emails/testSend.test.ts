import { describe, expect, it, vi } from 'vitest';
import type { SendResult } from '@/lib/email/send';
import { SAMPLE_EMAILS } from './samples';
import { TEST_SUBJECT_PREFIX, selectSamples, sendTestEmails } from './testSend';

const APP = 'https://app.example.com';
const ok: SendResult = { ok: true, id: 'abc' };

describe('selectSamples', () => {
  it('selects one email, all of them, or none for an unknown id', () => {
    expect(selectSamples('welcome').map((e) => e.id)).toEqual(['welcome']);
    expect(selectSamples('all')).toHaveLength(SAMPLE_EMAILS.length);
    expect(selectSamples('nope')).toEqual([]);
  });

  it('covers every kind of email in the design system (welcome, 3 alerts, digest, summary, what’s new, promo, verify, reset)', () => {
    expect(SAMPLE_EMAILS).toHaveLength(10);
    expect(new Set(SAMPLE_EMAILS.map((e) => e.group))).toEqual(new Set(['Onboarding', 'Alerts', 'Updates', 'Account']));
  });
});

describe('sendTestEmails', () => {
  it('sends every email to the one address with a [TEST] subject and both html and text', async () => {
    const send = vi.fn(async () => ok);
    const results = await sendTestEmails('all', 'me@example.com', APP, { send });
    expect(results).toHaveLength(SAMPLE_EMAILS.length);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(send).toHaveBeenCalledTimes(SAMPLE_EMAILS.length);
    for (const call of send.mock.calls as unknown as [{ to: string; subject: string; html: string; text: string }][]) {
      expect(call[0].to).toBe('me@example.com');
      expect(call[0].subject.startsWith(TEST_SUBJECT_PREFIX)).toBe(true);
      expect(call[0].html).toContain('<!DOCTYPE html>');
      expect(call[0].text.length).toBeGreaterThan(50);
    }
  });

  it('uses the supplied public app URL for images and links', async () => {
    const send = vi.fn(async () => ok);
    await sendTestEmails('welcome', 'me@example.com', APP, { send });
    const sent = (send.mock.calls as unknown as [{ html: string }][])[0][0];
    expect(sent.html).toContain(`${APP}/email/mm-logo-mark.png`);
  });

  it('reports the provider error verbatim per email and keeps going', async () => {
    const send = vi.fn(async (e: { subject: string }): Promise<SendResult> =>
      e.subject.includes('Welcome') ? { ok: false, error: 'You can only send testing emails to your own email address' } : ok
    );
    const results = await sendTestEmails('all', 'me@example.com', APP, { send });
    const welcome = results.find((r) => r.id === 'welcome')!;
    expect(welcome).toMatchObject({ ok: false, error: 'You can only send testing emails to your own email address' });
    expect(results.filter((r) => r.ok)).toHaveLength(SAMPLE_EMAILS.length - 1);
  });

  it('turns a throwing sender into a failed result, never an exception', async () => {
    const send = vi.fn(async () => {
      throw new Error('network down');
    });
    const results = await sendTestEmails('promo', 'me@example.com', APP, { send });
    expect(results).toEqual([{ id: 'promo', label: expect.any(String), ok: false, error: 'network down' }]);
  });

  it('reports an unknown id instead of sending anything', async () => {
    const send = vi.fn(async () => ok);
    const results = await sendTestEmails('nope', 'me@example.com', APP, { send });
    expect(results).toEqual([{ id: 'nope', label: 'nope', ok: false, error: 'Unknown email id' }]);
    expect(send).not.toHaveBeenCalled();
  });
});
