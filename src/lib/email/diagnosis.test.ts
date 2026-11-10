import { describe, expect, it } from 'vitest';
import { DEFAULT_SENDER, HIDDEN_VALUE, diagnoseEmailSetup, senderDomain, type DiagnosisInput } from './diagnosis';

const base: DiagnosisInput = {
  apiKeySet: true,
  from: 'MarketMitra <hello@mail.example.com>',
  contactLine: 'MarketMitra, 1 Road, Pune',
  verifiedDomains: ['mail.example.com'],
};

describe('senderDomain', () => {
  it('reads both address styles, lower-cased', () => {
    expect(senderDomain('MarketMitra <Hello@Mail.Example.com>')).toBe('mail.example.com');
    expect(senderDomain('a@b.co')).toBe('b.co');
  });

  it('rejects things that are not addresses', () => {
    for (const bad of ['', 'nope', '@x.com', 'a@b', 'a b@c.com', 'MarketMitra <not-an-email>']) expect(senderDomain(bad), bad).toBeNull();
  });
});

describe('diagnoseEmailSetup', () => {
  it('is ok when the key is set and the sender domain is verified', () => {
    const d = diagnoseEmailSetup(base);
    expect(d.status).toBe('ok');
    expect(d.issues).toEqual([]);
    expect(d.senderDomain).toBe('mail.example.com');
  });

  it('explains the real production problem: no ALERT_EMAIL_FROM means only the account owner receives mail', () => {
    const d = diagnoseEmailSetup({ ...base, from: undefined, verifiedDomains: [] });
    expect(d.status).toBe('error');
    expect(d.sender).toBe(DEFAULT_SENDER);
    expect(d.issues[0].message).toMatch(/ALERT_EMAIL_FROM is not set/);
    expect(d.issues[0].message).toMatch(/only delivers .* owner/);
    expect(d.issues[0].message).toMatch(/welcome/);
  });

  it('flags a sender on resend.dev even when explicitly configured', () => {
    const d = diagnoseEmailSetup({ ...base, from: 'x <a@resend.dev>' });
    expect(d.status).toBe('error');
    expect(d.issues.some((i) => /resend\.dev/.test(i.message))).toBe(true);
  });

  it('flags a sender domain that is not verified, and lists what is', () => {
    const d = diagnoseEmailSetup({ ...base, from: 'hi@other.com', verifiedDomains: ['mail.example.com'] });
    expect(d.status).toBe('error');
    expect(d.issues[0].message).toContain('"other.com" is not verified');
    expect(d.issues[0].message).toContain('mail.example.com');
    expect(diagnoseEmailSetup({ ...base, from: 'hi@other.com', verifiedDomains: [] }).issues[0].message).toMatch(/No domain is verified/);
  });

  it('compares domains case-insensitively', () => {
    expect(diagnoseEmailSetup({ ...base, from: 'hi@Mail.Example.com', verifiedDomains: ['MAIL.example.COM'] }).status).toBe('ok');
  });

  it('flags an invalid sender address', () => {
    const d = diagnoseEmailSetup({ ...base, from: 'not an address' });
    expect(d.status).toBe('error');
    expect(d.issues[0].message).toMatch(/not a valid sender address/);
  });

  it('NEVER echoes a configured value that is not a sender address (a mis-pasted secret must not reach the UI or the API)', () => {
    // A fake, obviously-not-real value shaped like the mistake: another env line pasted into this variable.
    const secretLine = 'SOME_SECRET_KEY=FAKEFAKEFAKEfakefakefake0000111122223333444=';
    const d = diagnoseEmailSetup({ ...base, from: secretLine });
    const everything = JSON.stringify(d);
    expect(everything).not.toContain('FAKEFAKEFAKE');
    expect(everything).not.toContain('SOME_SECRET_KEY');
    expect(d.sender).toBe(HIDDEN_VALUE);
    expect(d.senderDomain).toBeNull();
    expect(d.status).toBe('error');
  });

  it('still shows a valid sender address', () => {
    expect(diagnoseEmailSetup(base).sender).toBe('MarketMitra <hello@mail.example.com>');
  });

  it('explains a send-only API key instead of alarming about it', () => {
    const d = diagnoseEmailSetup({ ...base, verifiedDomains: null, domainsError: 'This API key is restricted to only send emails' });
    expect(d.status).toBe('warning');
    expect(d.issues[0].message).toMatch(/can only send mail/);
  });

  it('is an error with no API key, and says nothing is sent', () => {
    const d = diagnoseEmailSetup({ ...base, apiKeySet: false });
    expect(d.status).toBe('error');
    expect(d.issues).toHaveLength(1);
    expect(d.issues[0].message).toMatch(/no email is sent at all/);
  });

  it('downgrades to a warning when the provider could not be asked, and includes the reason', () => {
    const d = diagnoseEmailSetup({ ...base, verifiedDomains: null, domainsError: 'timeout' });
    expect(d.status).toBe('warning');
    expect(d.issues[0].message).toContain('timeout');
  });

  it('mentions a missing contact line as information only', () => {
    const d = diagnoseEmailSetup({ ...base, contactLine: '  ' });
    expect(d.status).toBe('ok');
    expect(d.issues).toEqual([{ severity: 'info', message: expect.stringContaining('EMAIL_CONTACT_LINE') }]);
  });
});
