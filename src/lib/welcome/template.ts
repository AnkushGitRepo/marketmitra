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
  mint: '#7ee2a8',
  mintBg: '#d9f7e6',
  tealStrong: '#0b7e63',
} as const;

const FONT = "Manrope, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** Where the real logo PNG is served from (public/brand/marketmitra-logo.png). */
export const LOGO_PATH = '/brand/marketmitra-logo.png';

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
  { title: 'Add your holdings', body: 'Type them in, or upload a broker statement or screenshot and Mitra reads it for you. You confirm before anything is saved.', path: '/portfolio', cta: 'Open portfolio' },
  { title: 'Connect your AI key', body: 'MarketMitra is free. The AI runs on your own Gemini, Claude or OpenRouter key, stored encrypted. We never charge for it.', path: '/settings#ai', cta: 'Add your key' },
  { title: 'Ask Mitra anything', body: 'Compare stocks, read an annual report, or sanity-check your portfolio. Mitra looks up live data and shows where an answer came from.', path: '/mitra', cta: 'Start a chat' },
];

export function renderWelcomeEmail({ name, appUrl }: WelcomeInput): RenderedEmail {
  const base = normaliseAppUrl(appUrl);
  const who = greetingName(name);
  const safeWho = escapeHtml(who);
  const url = (path: string) => `${base}${path}`;
  const subject = 'Welcome to MarketMitra';
  const preheader = 'See your whole portfolio clearly. Here are three quick steps to make MarketMitra yours.';

  const stepRows = STEPS.map(
    (s, i) => `
              <tr>
                <td valign="top" width="52" style="padding:20px 0;${i > 0 ? `border-top:1px solid ${COLOR.border};` : ''}font:700 13px/1.6 ${MONO};letter-spacing:0.04em;color:${COLOR.tealStrong};">0${i + 1}</td>
                <td valign="top" style="padding:20px 0;${i > 0 ? `border-top:1px solid ${COLOR.border};` : ''}">
                  <div style="font:700 16px/1.35 ${FONT};letter-spacing:-0.01em;color:${COLOR.ink};">${escapeHtml(s.title)}</div>
                  <div style="margin-top:4px;font:400 14.5px/1.6 ${FONT};color:${COLOR.muted};">${escapeHtml(s.body)}</div>
                  <a href="${escapeHtml(url(s.path))}" style="display:inline-block;margin-top:8px;font:700 14px/1.4 ${FONT};color:${COLOR.ink};text-decoration:none;border-bottom:2px solid ${COLOR.mint};">${escapeHtml(s.cta)} &rarr;</a>
                </td>
              </tr>`
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(subject)}</title>
  <style>
    @media only screen and (max-width: 620px) {
      .container { width: 100% !important; }
      .px { padding-left: 22px !important; padding-right: 22px !important; }
      .h1 { font-size: 34px !important; }
      .btn { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; margin: 0 0 10px !important; }
      .btn-cell { display: block !important; width: 100% !important; padding: 0 0 10px 0 !important; }
      .nav-cta { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COLOR.bg};">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.bg};">
    <tr>
      <td align="center" style="padding:28px 14px 36px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

          <!-- Nav pill, like the site -->
          <tr>
            <td style="padding-bottom:14px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:999px;">
                <tr>
                  <td style="padding:10px 12px 10px 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="middle" style="padding-right:10px;"><img src="${escapeHtml(url(LOGO_PATH))}" width="30" height="30" alt="MarketMitra" style="display:block;width:30px;height:30px;border:0;border-radius:9px;"></td>
                        <td valign="middle" style="font:700 18px/1 ${FONT};letter-spacing:-0.02em;color:${COLOR.ink};">MarketMitra</td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" class="nav-cta" style="padding:8px 8px 8px 0;">
                    <a href="${escapeHtml(url('/dashboard'))}" style="display:inline-block;padding:10px 18px;border-radius:999px;background:${COLOR.ink};font:700 13.5px/1 ${FONT};color:#ffffff;text-decoration:none;">Dashboard</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td class="px" align="center" bgcolor="#f6faf6" style="background:#f6faf6;background-image:radial-gradient(circle at 8% 0%, #ffe6d2 0, rgba(255,230,210,0) 46%),radial-gradient(circle at 94% 0%, #e6e3ff 0, rgba(230,227,255,0) 46%),radial-gradient(circle at 50% 38%, #d9f7e6 0, rgba(217,247,230,0) 58%);border:1px solid ${COLOR.border};border-radius:28px 28px 0 0;padding:44px 36px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="background:${COLOR.card};border:1px solid ${COLOR.border};border-radius:999px;padding:7px 14px;font:600 11px/1 ${MONO};letter-spacing:0.08em;text-transform:uppercase;color:${COLOR.muted};">
                    <span style="display:inline-block;width:7px;height:7px;border-radius:4px;background:#34c17c;margin-right:8px;vertical-align:middle;"></span>Welcome aboard
                  </td>
                </tr>
              </table>
              <h1 class="h1" style="margin:22px 0 0;font:800 44px/1.04 ${FONT};letter-spacing:-0.04em;color:${COLOR.ink};">Welcome, ${safeWho}.<br>See your whole portfolio clearly.</h1>
              <p style="margin:18px auto 28px;max-width:430px;font:400 16px/1.6 ${FONT};color:${COLOR.muted};">MarketMitra brings every holding into one calm dashboard, keeps it live, and explains what actually moved your money today.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td class="btn-cell" style="padding:0 5px 0 0;"><a class="btn" href="${escapeHtml(url('/dashboard'))}" style="display:inline-block;padding:15px 26px;border-radius:999px;background:${COLOR.ink};font:700 15px/1 ${FONT};color:#ffffff;text-decoration:none;">Open your dashboard</a></td>
                  <td class="btn-cell" style="padding:0 0 0 5px;"><a class="btn" href="${escapeHtml(url('/portfolio'))}" style="display:inline-block;padding:14px 24px;border-radius:999px;background:${COLOR.card};border:1px solid ${COLOR.border};font:700 15px/1 ${FONT};color:${COLOR.ink};text-decoration:none;">Add your holdings</a></td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- First steps -->
          <tr>
            <td class="px" style="background:${COLOR.card};border:1px solid ${COLOR.border};border-top:0;border-radius:0 0 28px 28px;padding:30px 36px 30px;">
              <div style="font:600 11px/1 ${MONO};letter-spacing:0.1em;text-transform:uppercase;color:${COLOR.faint};padding-bottom:6px;">Your first three steps</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${stepRows}
              </table>
              <p style="margin:12px 0 0;padding-top:20px;border-top:1px solid ${COLOR.border};font:400 12.5px/1.6 ${FONT};color:${COLOR.faint};">MarketMitra summarises public data. It does not give buy, sell or hold advice, and nothing here is investment advice. Prices can be delayed.</p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="px" align="center" style="padding:22px 12px 0;font:400 12.5px/1.8 ${FONT};color:${COLOR.faint};">
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
    `Welcome, ${who}.`,
    'See your whole portfolio clearly.',
    '',
    'MarketMitra brings every holding into one calm dashboard, keeps it live, and explains what actually moved your money today.',
    '',
    `Open your dashboard: ${url('/dashboard')}`,
    `Add your holdings: ${url('/portfolio')}`,
    '',
    'YOUR FIRST THREE STEPS',
    '',
    ...STEPS.flatMap((s, i) => [`0${i + 1}  ${s.title}`, `    ${s.body}`, `    ${s.cta}: ${url(s.path)}`, '']),
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
