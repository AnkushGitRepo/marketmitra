# 0039 — One-time welcome email for new hosted users

**Status:** accepted, built (#54)

## Decision
Each new hosted user gets one designed welcome email (HTML + plain-text alternative) on their first authenticated
page view: a branded header, a short welcome, three first steps (add holdings, connect an AI key, ask Mitra), a
button into the app, the not-investment-advice line and Privacy/Terms/Status links. It is sent through the existing
Resend setup (`RESEND_API_KEY`, `ALERT_EMAIL_FROM`; a verified domain is required for real recipients, as for alert
emails) to the user's **verified primary Clerk email**.

## How
- **Trigger without Clerk configuration:** the app layout schedules `maybeSendWelcome(userId)` with Next's
  `after()`, so it runs after the response and can never slow or break a page. No Clerk webhook, no signing secret.
  The alternative (a `user.created` webhook) would need dashboard setup; this works as soon as the email provider is
  configured.
- **Exactly once:** one `welcomeEmails` record per user (`sending | sent | failed`, unique on `userId`). A sender
  must win an atomic claim (insert, or a compare-and-set on `updatedAt` to retry); concurrent tabs, devices and
  serverless instances cannot both send. A stuck `sending` record is retried after 10 minutes, a `failed` one after
  an hour, at most 3 attempts. A warm-instance cache avoids a database call on every page view.
- **No-ops:** self-host (no user email), email not configured, no verified email, or already handled.
- **Safety:** all dynamic text is HTML-escaped; the base URL must be http(s) (anything else falls back to the
  production URL); no remote images, scripts or tracking pixels.

## Consequences
New collection `welcomeEmails`. Existing users get the email once on their next visit after deploy (there is no
"created recently" cutoff, because Clerk's creation time isn't read); say so if that should be limited. Not built: an
unsubscribe link (it is a single transactional message, not a mailing list), localisation, re-sending on request.

## Redesign: real logo, site-matching look, preview page (#57)
The first design was rejected: it used a placeholder glyph instead of the real mark and read as a generic template.
Now: the header is the **real logo** as a hosted PNG (`public/brand/marketmitra-logo.png`, 224×224 with transparent
corners, rendered from the same SVG geometry as `Logo.tsx`; mail clients don't render inline SVG, and the alt text
plus the live wordmark cover clients that block images), in a nav pill like the site's. The hero follows the landing
page (peach/mint/lavender wash with a solid fallback, pill label, bold tight headline "See your whole portfolio
clearly.", dark and white pill buttons), then three numbered steps with mint-underlined links. Buttons stack on phones.
The logo URL is `<NEXT_PUBLIC_APP_URL>/brand/marketmitra-logo.png`, so it only resolves once that file is deployed.
**Operator preview:** `/system/welcome-preview` (admin-only, 404 otherwise) shows exactly what users get in a
sandboxed frame, with the plain-text version; it sends nothing.

