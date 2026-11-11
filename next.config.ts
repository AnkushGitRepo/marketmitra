import { execSync } from 'node:child_process';
import type { NextConfig } from 'next';
import { legacyDashboardRedirects } from './src/lib/routes';

const isProd = process.env.NODE_ENV === 'production';

/**
 * The commit this build is made from, shown with the version. `npm run deploy:prod` passes APP_COMMIT (a CLI deploy has no .git on
 * the build machine); a local build reads git; anything else is "unknown".
 */
function buildCommit(): string {
  if (process.env.APP_COMMIT) return process.env.APP_COMMIT;
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Third parties the browser legitimately talks to. Everything else is blocked,
// which is what turns an XSS or a malicious dependency from "full takeover"
// into "can't load its payload or phone home".
const CLERK = ['https://*.clerk.accounts.dev', 'https://*.clerk.com', 'https://clerk-telemetry.com'];
const CLOUDFLARE_CHALLENGE = 'https://challenges.cloudflare.com'; // Clerk's bot protection
const VERCEL_INSIGHTS = ['https://vitals.vercel-insights.com', 'https://va.vercel-scripts.com'];
const LOGO_API = 'https://api.dharun.dev'; // company logos (CompanyLogo)

// 'unsafe-inline' for script/style is a conscious trade-off: Next.js emits
// inline bootstrap scripts, and a nonce would force every page to be
// dynamically rendered (losing the static landing page). The directives that
// matter most for exfiltration and injection stay strict: no foreign script
// hosts, no objects, no <base> hijack, no foreign form targets, no framing.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${CLERK.join(' ')} ${CLOUDFLARE_CHALLENGE} ${VERCEL_INSIGHTS[1]}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${LOGO_API} https://img.clerk.com ${CLERK[1]}`,
  "font-src 'self' data:",
  `connect-src 'self' ${CLERK.join(' ')} ${CLOUDFLARE_CHALLENGE} ${VERCEL_INSIGHTS.join(' ')}`,
  `frame-src ${CLERK[0]} ${CLERK[1]} ${CLOUDFLARE_CHALLENGE}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  // dev needs eval/HMR websockets, so the CSP is production-only.
  ...(isProd ? [{ key: 'Content-Security-Policy', value: CSP }] : []),
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // microphone=(self): Mitra chat dictation needs it. `microphone=()` blocked it for every origin
    // (no prompt, no site setting could help). Camera and the rest stay disabled.
    value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=(), interest-cohort=()',
  },
  // allow-popups keeps OAuth/SSO popups (Clerk) working while still isolating the window.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
];

const nextConfig: NextConfig = {
  // Stamped into the bundle so the running version can say which commit it was built from (src/lib/version.ts).
  env: { NEXT_PUBLIC_APP_COMMIT: buildCommit() },
  // The designed email templates are read from disk at runtime (src/emails/render.ts), so they must be
  // bundled into every serverless function that can send mail.
  outputFileTracingIncludes: { '/**': ['./src/emails/templates/**/*.html'] },
  // Dev-only route indicator badge — not part of the brand, off entirely.
  devIndicators: false,
  // Don't advertise the framework.
  poweredByHeader: false,
  // App pages moved from /dashboard/<page> to /<page>; keep old links (alert emails, bookmarks) working.
  async redirects() {
    return legacyDashboardRedirects();
  },
  async headers() {
    return [{ source: '/(.*)', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
