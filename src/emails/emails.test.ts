import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAlertEmail, buildDigestEmail, buildWelcomeEmail, commonVars, greetingName, normaliseAppUrl } from './emails';
import { TEMPLATE_NAMES, renderTemplate, stripDocComment } from './render';
import { SAMPLE_EMAILS } from './samples';
import { decodeEntities, extractTitle, htmlToText } from './text';
import { ARROW, TONE_COLORS, alertTone } from './tones';

const APP = 'https://app.example.com';
const ROOT = process.cwd();
const TEMPLATE_DIR = join(ROOT, 'src', 'emails', 'templates');

describe('the shipped templates', () => {
  it('match the registered list exactly (no template is unregistered or missing)', () => {
    const files = readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort();
    expect(files).toEqual([...TEMPLATE_NAMES].sort());
  });

  it('only reference images that are actually shipped in public/email', () => {
    for (const name of TEMPLATE_NAMES) {
      const src = readFileSync(join(TEMPLATE_DIR, `${name}.html`), 'utf8');
      for (const m of src.matchAll(/\{\{asset_base_url\}\}\/([A-Za-z0-9._-]+\.png)/g)) {
        expect(existsSync(join(ROOT, 'public', 'email', m[1])), `${name}.html uses missing asset ${m[1]}`).toBe(true);
      }
    }
  });

  it('compile despite the header comment that documents the syntax with literal {{#each}}', () => {
    const raw = readFileSync(join(TEMPLATE_DIR, 'welcome.html'), 'utf8');
    expect(raw).toContain('{{#each}}');
    expect(stripDocComment(raw)).not.toContain('{{#each}}');
  });
});

describe.each(SAMPLE_EMAILS)('$label', (sample) => {
  const mail = sample.build(APP, { strict: true }); // strict: throws if any documented variable is missing

  it('renders completely: no unresolved placeholders, "undefined" or "[object"', () => {
    expect(mail.html).not.toMatch(/\{\{|\}\}/);
    expect(mail.html).not.toContain('undefined');
    expect(mail.html).not.toContain('[object');
  });

  it('stays under Gmail’s ~102 KB clipping limit', () => {
    expect(Buffer.byteLength(mail.html)).toBeLessThan(100_000);
  });

  it('has a real subject, a text alternative, and no scripts', () => {
    expect(mail.subject.length).toBeGreaterThan(3);
    expect(mail.text.length).toBeGreaterThan(80);
    expect(mail.html).not.toMatch(/<script\b/i);
    expect(mail.text).not.toMatch(/<[a-z][^>]*>/i);
  });

  it('serves every image from this app (absolute https URL) or an explicit https URL', () => {
    const srcs = [...mail.html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((m) => m[1]);
    expect(srcs.length).toBeGreaterThan(0);
    for (const src of srcs) expect(src.startsWith(`${APP}/email/`) || src.startsWith('https://'), src).toBe(true);
  });

  it('uses the supplied real logo mark', () => {
    expect(mail.html).toContain(`${APP}/email/mm-logo-mark.png`);
  });
});

describe('escaping', () => {
  it('escapes HTML in every user-supplied value', () => {
    const evil = '<script>alert(1)</script>"x"&';
    const welcome = buildWelcomeEmail({ appUrl: APP, firstName: evil });
    expect(welcome.html).not.toContain('<script>alert(1)');
    expect(welcome.html).toContain('&lt;script&gt;');
    const alert = buildAlertEmail({
      appUrl: APP, type: 'STOP-LOSS', direction: 'down', stockName: evil, ticker: '"><img src=x>', exchange: 'NSE', triggeredAt: '1:00 PM', summary: evil,
      currentPrice: '₹1', priceLabel: 'now', changePct: '1%', changePeriod: 'today', triggerLabel: 'x', triggerLevel: '₹1', holdingImpact: '₹1', holdingDetail: 'x', alertUrl: APP, manageAlertUrl: APP,
    });
    expect(alert.html).not.toContain('<img src=x>');
    expect(alert.html).not.toContain('<script>alert(1)');
  });
});

describe('strict vs lenient rendering', () => {
  it('strict throws on a missing variable; lenient (production) renders anyway', () => {
    expect(() => renderTemplate('welcome', {}, { strict: true })).toThrow();
    expect(() => renderTemplate('welcome', {})).not.toThrow();
  });
});

describe('alert tones and arrows', () => {
  it('follows the design README table', () => {
    expect(alertTone('STOP-LOSS', 'down')).toBe('loss');
    expect(alertTone('DRAWDOWN', 'down')).toBe('warn');
    expect(alertTone('PRICE TARGET', 'up')).toBe('gain');
    for (const t of ['BIG MOVE', '52-WEEK', 'PORTFOLIO'] as const) {
      expect(alertTone(t, 'down')).toBe('warn');
      expect(alertTone(t, 'up')).toBe('gain');
    }
    expect(TONE_COLORS.loss).toEqual({ bg: '#fbe9e4', border: '#f3cfc5', fg: '#9a3f2b' });
    expect(TONE_COLORS.warn.fg).toBe('#8a4b12');
    expect(TONE_COLORS.gain.fg).toBe('#0f6b3f');
  });

  it('passes real arrow characters, so nothing renders as a literal "&#9660;"', () => {
    expect(ARROW).toEqual({ down: '▼', up: '▲' });
    const stop = SAMPLE_EMAILS.find((s) => s.id === 'alert-stoploss')!.build(APP).html;
    expect(stop).toContain('▼');
    expect(stop).not.toContain('&amp;#9660;');
    expect(SAMPLE_EMAILS.find((s) => s.id === 'alert-target')!.build(APP).html).toContain('▲');
  });

  it('always says the direction in words as well as colour', () => {
    expect(SAMPLE_EMAILS.find((s) => s.id === 'alert-stoploss')!.build(APP).text).toMatch(/down/i);
  });
});

describe('footer and links', () => {
  it('derives asset, privacy and preference URLs from the app URL, with a safe fallback', () => {
    const v = commonVars({ appUrl: `${APP}/` });
    expect(v.asset_base_url).toBe(`${APP}/email`);
    expect(v.privacy_url).toBe(`${APP}/privacy`);
    expect(v.preferences_url).toBe(`${APP}/settings#notifications`);
    expect(v.unsubscribe_url).toBe(v.preferences_url);
    expect(commonVars({ appUrl: APP, unsubscribeUrl: `${APP}/u?t=1` }).unsubscribe_url).toBe(`${APP}/u?t=1`);
    expect(commonVars({ appUrl: APP, contactLine: 'MarketMitra · 1 Road, Pune' }).contact_line).toBe('MarketMitra · 1 Road, Pune');
  });

  it('refuses unsafe base URLs', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', '', 'ftp://x.com', 'https://a.com/" onclick="x', null, undefined]) {
      expect(normaliseAppUrl(bad as string)).toBe('https://marketmitra-v2.vercel.app');
    }
    expect(normaliseAppUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });

  it('greets with a cleaned first name, or "there"', () => {
    expect(greetingName('  Asha   Rao ')).toBe('Asha Rao');
    expect(greetingName(null)).toBe('there');
    expect(greetingName('x'.repeat(200)).length).toBe(60);
  });
});

describe('text conversion', () => {
  it('keeps links as "text (url)", drops hidden preheaders, styles and comments, and decodes entities', () => {
    const html = `<html><head><title>T &amp; Co</title><style>.a{}</style></head><body><!--[if mso]>X<![endif]-->
      <div style="display:none;max-height:0">HIDDEN PREHEADER</div>
      <p>Hello&nbsp;&rarr; <a href="https://x.test/a?b=1&amp;c=2">Open it</a></p><p>Second &#9650; line</p></body></html>`;
    const text = htmlToText(html);
    expect(text).toContain('Open it (https://x.test/a?b=1&c=2)');
    expect(text).toContain('Second ▲ line');
    expect(text).not.toMatch(/HIDDEN|mso|\.a\{/);
    expect(extractTitle(html)).toBe('T & Co');
  });

  it('decodes numeric and named entities and leaves unknown ones alone', () => {
    expect(decodeEntities('&#9660; &#x25B2; &middot; &amp; &bogus;')).toBe('▼ ▲ · & &bogus;');
  });

  it('does not dump unsafe-looking hrefs as links', () => {
    expect(htmlToText('<a href="javascript:alert(1)">click</a>')).toBe('click');
  });
});

describe('list sections render every row', () => {
  const html = (id: string) => SAMPLE_EMAILS.find((e) => e.id === id)!.build(APP, { strict: true }).html;

  it('digest: three gainers, three losers, the IPO, and all four indices', () => {
    const d = html('digest');
    for (const t of ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON', 'ZETA', 'Sample Holdings', '₹180–190']) expect(d, t).toContain(t);
    for (const v of ['25,044.65', '81,106.65', '59,741.25', '17.42']) expect(d, v).toContain(v);
  });

  it('digest: the IPO section disappears when there are none', () => {
    const base = SAMPLE_EMAILS.find((e) => e.id === 'digest')!;
    expect(base.build(APP).html).toContain('Sample Holdings');
    // Same sample with ipos omitted via the builder default.
    const without = buildDigestNoIpo();
    expect(without).not.toContain('Sample Holdings');
  });

  it('Mitra summary lists each question and the counts', () => {
    const m = html('mitra-summary');
    for (const q of ['How is my portfolio doing today?', 'Compare two banks on margins', 'What should I check before an IPO?']) expect(m).toContain(q);
    for (const n of ['12', '13']) expect(m).toContain(n);
  });

  it('What’s new lists the headline feature and every smaller update, with the hero from /email/', () => {
    const w = html('whats-new');
    for (const t of ['Sample headline feature', 'Smaller update one', 'Smaller update two']) expect(w).toContain(t);
    expect(w).toContain(`${APP}/email/hero-whatsnew.png`);
  });

  it('promo shows its headline, button and hero', () => {
    const p = html('promo');
    expect(p).toContain('Sample announcement headline');
    expect(p).toContain('Star us on GitHub');
    expect(p).toContain(`${APP}/email/hero-opensource.png`);
  });
});

function buildDigestNoIpo(): string {
  const g = { ticker: 'A', name: 'A Ltd', price: '₹1', changeText: 'up 1%' };
  const idx = { value: '1', change: 'up 1%', dir: 'gain' as const };
  return buildDigestEmail(
    { appUrl: APP, period: 'Weekly', dateLabel: 'x', nifty50: idx, sensex: idx, niftybank: idx, vix: idx, mitraSummary: 's', gainers: [g], losers: [g], dataAsOf: 'x' },
    { strict: true }
  ).html;
}
