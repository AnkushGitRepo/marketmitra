// Welcome email for new hosted users (#54). Pure: data in, { subject, html, text } out.
// Table layout + inline styles because that is what every mail client renders; colours match the
// app's design tokens. No images (so nothing breaks when a client blocks them) and no tracking.

export interface WelcomeInput {
  /** First name or username; blank falls back to "there". */
  readonly name?: string | null;
  /** Public base URL of the app, e.g. https://marketmitra-v2.vercel.app */
  readonly appUrl: string;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const COLOR = {
  bg: '#fbf8f1',
  card: '#ffffff',
  ink: '#16191c',
  muted: '#606870',
  faint: '#8a9099',
  border: '#ede9de',
  tint: '#f2f7f4',
  teal: '#17c39a',
  tealStrong: '#0b7e63',
} as const;

const FONT = "Manrope, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) origins are accepted, so a bad env value can never produce a javascript: or data: link. */
export function normaliseAppUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s"'<>]+$/i.test(trimmed) ? trimmed : 'https://marketmitra-v2.vercel.app';
}

export function greetingName(name: string | null | undefined): string {
  const clean = (name ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return clean || 'there';
}

interface Step {
  readonly title: string;
  readonly body: string;
  readonly path: string;
  readonly cta: string;
}

const STEPS: readonly Step[] = [
  { title: 'Add your holdings', body: 'Type them in, or upload a broker statement or screenshot and Mitra will read it for you. You confirm before anything is saved.', path: '/portfolio', cta: 'Open portfolio' },
  { title: 'Connect your AI key', body: 'MarketMitra is free: the AI runs on your own Gemini, Claude or OpenRouter key, stored encrypted. Nothing is ever charged by us.', path: '/settings#ai', cta: 'Add your key' },
  { title: 'Ask Mitra anything', body: 'Compare stocks, read an annual report, or sanity-check your portfolio. Mitra can look up live data and cite where an answer came from.', path: '/mitra', cta: 'Start a chat' },
];

export function renderWelcomeEmail({ name, appUrl }: WelcomeInput): RenderedEmail {
  const base = normaliseAppUrl(appUrl);
  const who = greetingName(name);
  const safeWho = escapeHtml(who);
  const url = (path: string) => `${base}${path}`;
  const subject = 'Welcome to MarketMitra';
  const preheader = 'Three quick steps to get your portfolio, the markets and an AI research partner in one place.';

  const stepRows = STEPS.map(
    (s, i) => `
          <tr>
            <td style="padding:0 0 14px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.tint};border:1px solid ${COLOR.border};border-radius:14px;">
                <tr>
                  <td width="48" valign="top" style="padding:18px 0 18px 18px;">
                    <div style="width:30px;height:30px;line-height:30px;border-radius:15px;background:${COLOR.ink};color:#ffffff;font:700 14px/30px ${FONT};text-align:center;">${i + 1}</div>
                  </td>
                  <td valign="top" style="padding:18px 18px 18px 6px;">
                    <div style="font:700 15px/1.3 ${FONT};color:${COLOR.ink};">${escapeHtml(s.title)}</div>
                    <div style="margin-top:4px;font:400 14px/1.55 ${FONT};color:${COLOR.muted};">${escapeHtml(s.body)}</div>
                    <a href="${escapeHtml(url(s.path))}" style="display:inline-block;margin-top:8px;font:700 13.5px/1.4 ${FONT};color:${COLOR.tealStrong};text-decoration:none;">${escapeHtml(s.cta)} &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>${escapeHtml(subject)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 20px !important; padding-right: 20px !important; }
      .h1 { font-size: 26px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.bg};">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.bg};">
    <tr>
      <td align="center" style="padding:32px 16px 40px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td class="px" style="padding:0 8px 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="padding-right:10px;">
                    <div style="width:30px;height:30px;border-radius:9px;background:${COLOR.ink};text-align:center;font:700 16px/30px ${FONT};color:${COLOR.teal};">&#8599;</div>
                  </td>
                  <td valign="middle" style="font:700 19px/1 ${FONT};letter-spacing:-0.02em;color:${COLOR.ink};">MarketMitra</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:22px;padding:36px 36px 28px;">
              <div style="font:600 11px/1 ${FONT};letter-spacing:0.08em;text-transform:uppercase;color:${COLOR.tealStrong};">Welcome</div>
              <h1 class="h1" style="margin:12px 0 0;font:700 30px/1.15 ${FONT};letter-spacing:-0.025em;color:${COLOR.ink};">Hi ${safeWho}, you&rsquo;re all set.</h1>
              <p style="margin:14px 0 26px;font:400 15.5px/1.6 ${FONT};color:${COLOR.muted};">MarketMitra brings your Indian-market portfolio, live data, news, IPOs and an AI research partner into one calm place. Here is the quickest way to make it yours.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}
              </table>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 4px;">
                <tr>
                  <td style="border-radius:999px;background:${COLOR.ink};">
                    <a href="${escapeHtml(url('/dashboard'))}" style="display:inline-block;padding:14px 28px;font:700 15px/1 ${FONT};color:#ffffff;text-decoration:none;border-radius:999px;">Open your dashboard</a>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;padding-top:18px;border-top:1px solid ${COLOR.border};font:400 12.5px/1.55 ${FONT};color:${COLOR.faint};">MarketMitra summarises public data. It does not give buy, sell or hold advice, and nothing here is investment advice. Prices can be delayed.</p>
            </td>
          </tr>
          <tr>
            <td class="px" align="center" style="padding:20px 12px 0;font:400 12.5px/1.7 ${FONT};color:${COLOR.faint};">
              You&rsquo;re receiving this one-time message because you created a MarketMitra account.<br>
              <a href="${escapeHtml(url('/privacy'))}" style="color:${COLOR.muted};text-decoration:underline;">Privacy</a> &nbsp;&middot;&nbsp;
              <a href="${escapeHtml(url('/terms'))}" style="color:${COLOR.muted};text-decoration:underline;">Terms</a> &nbsp;&middot;&nbsp;
              <a href="${escapeHtml(url('/status'))}" style="color:${COLOR.muted};text-decoration:underline;">System status</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    `Hi ${who}, you're all set.`,
    '',
    'MarketMitra brings your Indian-market portfolio, live data, news, IPOs and an AI research partner into one calm place. Three quick steps:',
    '',
    ...STEPS.flatMap((s, i) => [`${i + 1}. ${s.title}`, `   ${s.body}`, `   ${s.cta}: ${url(s.path)}`, '']),
    `Open your dashboard: ${url('/dashboard')}`,
    '',
    'MarketMitra summarises public data. It does not give buy, sell or hold advice, and nothing here is investment advice.',
    '',
    `Privacy: ${url('/privacy')}`,
    `Terms: ${url('/terms')}`,
    `System status: ${url('/status')}`,
    '',
    "You're receiving this one-time message because you created a MarketMitra account.",
  ].join('\n');

  return { subject, html, text };
}
