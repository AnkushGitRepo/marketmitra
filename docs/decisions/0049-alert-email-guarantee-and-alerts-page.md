# 0049 — Alert emails you can rely on, and a decluttered Alerts page

Status: accepted (2026-11-11, issue #85)

## Context

A triggered alert already tried to email the user, but there was no per-user setting, a failed send was swallowed and never retried
(and the alert is marked triggered before delivery, so one dropped attempt lost the email for good), nothing could test email,
and nothing explained why one did not arrive. The Alerts page put two configuration cards above the alerts, showed wide sparse
cards with weak actions, made old triggered alerts look as urgent as new ones, and broke on phones.

## Decision: email

- **Setting** `emailAlertsEnabled` (per user, default on; an absent value reads as on). Read failures also read as on, so a
  database hiccup cannot silently drop alert emails.
- **Route** (`decideEmailRoute`, pure): send only when the setting is on, a provider key exists and an address resolves (Clerk
  primary email when hosted, `ALERT_EMAIL_TO` when self-hosting). The user's own choice is checked first, so "off" is never
  reported as a server fault. Every skip has a plain-words reason, with the fix for hosted vs self-host.
- **Retry** (`sendEmail`): up to 3 attempts, 400 ms then 1.2 s apart, for rate limits (429), 5xx and network errors; never for
  an invalid sender, an unverified domain or a bad address (`isTransientEmailError`). Short enough for one cron run.
- **Visibility**: every attempt stores `lastAlertEmail` (sent / failed with the provider's reason / skipped with the reason) shown
  beside the switch; failures are also written to the system log as `alerts:email` with the address masked.
- **Test**: `POST /api/settings/notifications/test` with `channel: "email"` sends a real email through the same route and returns
  409 with the reason when email cannot be sent. `GET/PUT /api/settings/email-alerts` read and set the setting plus status.
- Not changed: the plain transactional email body. The designed alert template needs live holding data (price, impact) the
  notification payload does not carry yet; still a follow-up from ADR 0040.

## Decision: page

- Header with a gear "Alert settings" (a slide-over, a full-height sheet on phones, holding Email alerts, Guardrails and the
  Slack / Telegram / WhatsApp / webhook channels) and "+ New alert"; the duplicated intro sentence is gone; a one-line guardrail
  banner replaces the card.
- Tabs Active / Triggered / Paused / All with counts (empty ones hidden), a type menu (Stop-loss, Price target, Moves &
  52-week, Portfolio, IPO) and a ticker search. Opens on Active, else the first tab with content.
- Compact rows: state and title, the numbers (hit-at / last value, triggered date / last check), a primary Re-activate or Pause pill
  and a kebab (Edit, Delete with a confirm modal). Sections: Needs attention (triggered in the last 7 days), Active monitoring,
  Paused, Earlier triggers (older, muted). Phones: vertical cards with the actions on their own row.

## Deviations from the request

- "Market Timing" is the IPO alerts (the odd "nse: opens" row is an IPO alert), so the menu says **IPO**.
- Stop-loss covers price floors, trailing stops and drawdown watches (all fall protection).
- CSS Modules, not Tailwind (ADR 0003).

## Consequences

`resolveChannels` now reads one more setting per delivery; `lastAlertEmail` is a single field overwritten per attempt (it records
the latest outcome, not a history). The email only goes to the account address; there is no per-alert recipient.
