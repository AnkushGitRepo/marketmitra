# 0032: Security hardening pass

Date: 2026-11-06
Status: accepted, built, verified locally (not yet deployed at time of writing).

## Context

A defensive review of the whole stack (Next app, FastAPI service, dependencies,
git history) found real issues, ranked below. The repo is public and the hosted
instance has open sign-up, so "signed in" is not a trust boundary.

## Findings and decisions

| Severity | Finding | Fix |
| --- | --- | --- |
| Critical | `next` 16.3.4 had a critical advisory (RCE in `next/og`) plus 9 high-severity transitive advisories (18 total). | `next@16.4.5`, `npm audit fix`, `uuid` override → **0 vulnerabilities**. Python floors for Pillow/urllib3/certifi/filelock. |
| High | **SSRF**: any signed-in user could save a Slack/WhatsApp/custom webhook pointing at `localhost`, private IPs or cloud-metadata, and Slack errors echoed the response body back. | `lib/security/outbound.ts`: static URL validation on save *and* send, https + public hosts only when hosted, Slack pinned to `hooks.slack.com`, no redirects, and a connect-time DNS guard (defeats rebinding). Responses are never echoed; network errors are generalised. |
| High | Cron/internal secrets compared with `===`/`!=` (timing leak); agent self-calls built their target from the request `Host` and attached `CRON_SECRET` (secret exfiltration via a forged Host). | Constant-time compare everywhere (JS + Python). Self-calls use a trusted origin (`NEXT_PUBLIC_APP_URL` → Vercel production URL → loopback). |
| High | No security headers at all. | CSP (script/connect/img/frame allowlist, `object-src 'none'`, `frame-ancestors 'none'`), HSTS, nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP; `X-Powered-By` removed. Also on the Python API. |
| Medium | Rate limiter keyed on the first (client-controlled) `X-Forwarded-For` hop → trivially bypassed. | Platform-set `x-vercel-forwarded-for` / `x-real-ip` first (JS + Python). |
| Medium | No CSRF defence beyond cookies; self-host has no login at all. | Proxy rejects cross-site browser writes to `/api/*` (Origin / Sec-Fetch-Site); MCP stays exempt (anonymous by design). |
| Medium | System event log readable by any signed-in user (open sign-up). | `ADMIN_USER_IDS` allowlist, closed by default; page and API both enforce it. |
| Medium | Python `/documents/extract-text` fetched any URL (token-gated, but followed redirects blindly, buffered unbounded bodies). | Public-host validation on every hop, manual redirects (max 5), streamed download with a hard size cap. |
| Low | `javascript:` URLs from RSS/filings rendered as links. | `safeHref` (http/https only). |
| Low | Malformed ids could throw in holdings; free-text AI model id reached provider URLs. | `ObjectId.isValid` guards; model id charset restricted. |

## Not fixable in code — needs the owner

- **Leaked credentials in public git history** (v1 `scraper/.env`,
  `sentiment_analyser/.env`, `server/config.env`): a MongoDB connection string,
  a NewsAPI key and a JWT secret. History rewriting does not un-leak them —
  they must be **rotated/revoked**. They belong to the old v1 stack (a different
  Mongo cluster from the current one).
- **Clerk dev instance → production instance** on a custom domain (also removes
  the third-party-cookie warnings and the dev handshake).
- Set `ADMIN_USER_IDS` on the hosted deployment or the event log stays hidden.

## Accepted trade-offs

- CSP keeps `'unsafe-inline'` for scripts/styles: a nonce would force every page
  to render dynamically and lose the static landing page. The exfiltration and
  injection directives remain strict.
- The Python service's read endpoints are public by design (documented API) and
  rely on per-IP rate limiting (Upstash); ingestion/embedding/PDF endpoints are
  bearer-protected and fail closed when their token is unset.
