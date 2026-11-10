import { describe, expect, it } from 'vitest';
import { LOGO_PATH, escapeHtml, greetingName, normaliseAppUrl, renderWelcomeEmail } from './template';

const APP = 'https://app.example.com';

describe('renderWelcomeEmail', () => {
  const mail = renderWelcomeEmail({ name: 'Asha', appUrl: APP });

  it('has a plain subject and both an HTML and a text body', () => {
    expect(mail.subject).toBe('Welcome to MarketMitra');
    expect(mail.html).toContain('<!DOCTYPE html>');
    expect(mail.text.length).toBeGreaterThan(200);
  });

  it('greets by name and links every call to action to the configured app URL', () => {
    expect(mail.html).toContain('Welcome, Asha.');
    expect(mail.html).toContain('See your whole portfolio clearly.');
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

  it('is mobile friendly and runs no scripts', () => {
    expect(mail.html).toContain('name="viewport"');
    expect(mail.html).toContain('max-width: 620px');
    expect(mail.html).not.toMatch(/<script\b/i);
  });

  it('shows the real logo as its only image: absolute URL, size and alt text for blocked-image clients', () => {
    const imgs = mail.html.match(/<img\b[^>]*>/gi) ?? [];
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain(`src="${APP}${LOGO_PATH}"`);
    expect(imgs[0]).toContain('alt="MarketMitra"');
    expect(imgs[0]).toMatch(/width="30"\s+height="30"/);
    expect(LOGO_PATH).toBe('/brand/marketmitra-logo.png');
  });

  it('puts the wordmark beside the logo and never uses the old placeholder glyph', () => {
    expect(mail.html).toContain('>MarketMitra</td>');
    expect(mail.html).not.toContain('&#8599;');
  });

  it('gives both a primary and a secondary call to action, plus all three steps', () => {
    expect(mail.html).toContain('Open your dashboard');
    expect(mail.html).toContain('Add your holdings');
    for (const step of ['Add your holdings', 'Connect your AI key', 'Ask Mitra anything']) expect(mail.html).toContain(step);
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
