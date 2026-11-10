# 0040 — Email design system (supplied designs, Handlebars renderer)

**Status:** accepted, built (#59)

## Context
The first welcome email (ADR 0039) was rejected. The maintainer supplied a complete designed system
(`marketmitra-emails.zip`, made with Claude Design): welcome, alert (three tones), digest, what's new, promo,
verify-email, password-reset and Mitra summary, with shared components, illustrations, mobile and dark previews and a
README of exact variables.

## Decision
- **Templates are the supplied HTML, unchanged**, in `src/emails/templates/*.html`; the PNG assets (real logo, step
  illustrations, heroes) are served from `public/email/` (`<app>/email/*.png`). Table layout and inline CSS are the
  design's own choice for email clients (Outlook VML buttons, dark-mode overrides, web fonts as enhancement).
- **Renderer:** `handlebars` (the engine the README specifies). `{{var}}` is HTML-escaped and no template uses
  triple-stash, so a value can never inject markup. The leading doc comment (which spells out `{{#each}}`) is stripped
  before compiling. Rendering is lenient in production (a missing optional value never blocks a send) and **strict in
  tests** (any variable a template uses but the builder doesn't supply fails the build: this already caught an
  undocumented `hero_image_url` in the promo template).
- **Typed builders** (`src/emails/emails.ts`), one per email, return `{ subject, html, text }`: the subject is the
  rendered `<title>`, the plain text is derived from the HTML (links kept as "text (url)", hidden preheader dropped),
  so the three cannot drift. Alert tones/arrows follow the README (real ▼/▲ characters, because the templates escape
  `{{value}}` and an entity would print literally).
- **Footer URLs** come from the app URL: preferences = `/settings#notifications`, privacy = `/privacy`, assets =
  `/email`. `unsubscribe_url` falls back to the preferences page until one-click unsubscribe exists (follow-up);
  `contact_line` comes from `EMAIL_CONTACT_LINE` (set a real postal/contact line before any marketing send).
- **Welcome email** now uses the designed template (replacing ADR 0039's template; its exactly-once sending is
  unchanged). **Admin gallery** at `/system/emails` renders every email with sample data (desktop/mobile width, plain
  text), admin-only (404 otherwise), sending nothing.
- Templates are read from disk at runtime, so `outputFileTracingIncludes` bundles them into serverless functions.

## Not built (follow-ups)
- **Alert emails with live data** (the existing alert email is still the old generic one): the designed alert needs
  company name, day change and holding impact, which the evaluator has the inputs for but must pass through.
- **Unsubscribe and email preferences** (signed one-click link, per-category settings, `List-Unsubscribe` headers).
- **Senders** for digest, Mitra summary, what's new and promo: they need an audience, scheduling and opt-in decisions.
- **verify-email / password-reset** are sent by Clerk with Clerk's own templates; using these designs needs Clerk's
  custom email delivery.
- Real mail-client testing (Litmus/Email on Acid or real inboxes); the design README notes only a headless Chrome
  check was done, and so was ours.

## Delivery diagnosis and test sending (#63)
A new user reported no welcome email. Cause on production: `RESEND_API_KEY` was set but `ALERT_EMAIL_FROM` was not, so
mail went from Resend's shared test sender, which only delivers to the Resend account owner; the failure was swallowed.
- **Visible failures:** `sendHtmlEmail` returns the provider's real error; a failed welcome email is logged to the event
  log (`email:welcome`, recipient masked) and the reason is stored on the welcome record (`lastError`, cleared on success).
- **Diagnosis** (`src/lib/email/diagnosis.ts`, pure): API key, sender address, whether the sender domain is verified in
  Resend (read-only `domains.list`; a send-only key can't list domains, which is reported as fine), contact line. It
  **never echoes a configured value that isn't a valid sender address**: a mis-pasted `.env` line once put another variable's
  secret into `ALERT_EMAIL_FROM`, and a diagnostic UI must not turn that into a leak.
- **Admin tools** (admin-only, in `/system/emails`): a status panel, **Send test to me** per email and **Send all** (the 10
  designs) to the caller's *own* address (hosted: verified Clerk email; self-host: `ALERT_EMAIL_TO`), subject prefixed
  `[TEST]`, provider errors shown verbatim, capped at 30 per 10 minutes. API: `GET /api/system/emails/status`,
  `POST /api/system/emails/test` (both in OpenAPI).
- Not done: alert emails still use their own sender and the old format (next piece of work).

