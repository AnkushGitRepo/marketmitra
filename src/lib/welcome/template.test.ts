import { describe, expect, it } from 'vitest';
import { escapeHtml, greetingName, normaliseAppUrl, renderWelcomeEmail } from './template';

const APP = 'https://app.example.com';

describe('renderWelcomeEmail', () => {
  const mail = renderWelcomeEmail({ name: 'Asha', appUrl: APP });

  it('has a plain subject and both an HTML and a text body', () => {
    expect(mail.subject).toBe('Welcome to MarketMitra');
    expect(mail.html).toContain('<!DOCTYPE html>');
    expect(mail.text.length).toBeGreaterThan(200);
  });

  it('greets by name and links every call to action to the configured app URL', () => {
    expect(mail.html).toContain('Hi Asha, you&rsquo;re all set.');
    for (const path of ['/dashboard', '/portfolio', '/settings#ai', '/mitra', '/privacy', '/terms', '/status']) {
      expect(mail.html, path).toContain(`href="${APP}${path}"`);
      expect(mail.text, path).toContain(`${APP}${path}`);
    }
  });

  it('carries the not-investment-advice line and a reason for receiving it', () => {
    expect(mail.html).toMatch(/nothing here is investment advice/);
    expect(mail.html).toMatch(/because you created a MarketMitra account/);
    expect(mail.text).toMatch(/not|nothing here is investment advice/);
  });

  it('is mobile friendly and dark-mode aware, and loads nothing remote', () => {
    expect(mail.html).toContain('name="viewport"');
    expect(mail.html).toContain('max-width: 620px');
    expect(mail.html).toContain('color-scheme');
    expect(mail.html).not.toMatch(/<img\b/i);
    expect(mail.html).not.toMatch(/<script\b/i);
  });
});

describe('escaping', () => {
  it('escapes HTML in the name so it cannot inject markup', () => {
    const evil = renderWelcomeEmail({ name: '<script>alert(1)</script>"x"', appUrl: APP });
    expect(evil.html).not.toContain('<script>alert(1)');
    expect(evil.html).toContain('&lt;script&gt;');
    expect(evil.html).toContain('&quot;x&quot;');
  });

  it('escapeHtml covers the five special characters', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });
});

describe('greetingName', () => {
  it('trims, collapses whitespace, caps the length and falls back to "there"', () => {
    expect(greetingName('  Asha   Rao ')).toBe('Asha Rao');
    expect(greetingName(null)).toBe('there');
    expect(greetingName('   ')).toBe('there');
    expect(greetingName('x'.repeat(200)).length).toBe(60);
  });
});

describe('normaliseAppUrl', () => {
  it('strips trailing slashes and accepts http(s) only', () => {
    expect(normaliseAppUrl('https://a.example.com///')).toBe('https://a.example.com');
    expect(normaliseAppUrl('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('falls back to the production URL for anything unsafe', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', '', 'ftp://x.com', 'https://a.com/" onclick="x']) {
      expect(normaliseAppUrl(bad), bad).toBe('https://marketmitra-v2.vercel.app');
    }
  });
});
