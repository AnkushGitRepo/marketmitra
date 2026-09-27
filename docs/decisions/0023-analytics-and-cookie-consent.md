# 0023: Analytics + cookie-consent (production-readiness pass)

Date: 2026-09-12
Status: accepted, built

## Context

The production-readiness pass required deciding two closely related
questions together, since they're really one decision:

1. Should MarketMitra have any usage analytics at all, given "no paid
   tier, ever" (ADR 0016) and a privacy-conscious, self-hostable product?
2. Does the site need a cookie-consent banner, and if so, what should it
   actually let the visitor choose?

Splitting these into two separate decisions would risk exactly the
outcome the checklist warned against: shipping a cookie banner that
promises a choice ("accept/reject tracking cookies") that doesn't
correspond to anything real in the product.

## Decision

### Analytics: Vercel Web Analytics, hosted-only, on by default

`@vercel/analytics` (`<Analytics />` from `@vercel/analytics/next`) is
mounted in `src/app/layout.tsx`, gated behind `isHosted()` — it never
loads in self-hosted mode, since a self-hoster's traffic is none of
MarketMitra-the-project's business, and there's no operator to report it
to.

Chosen over a self-hosted/open-source alternative (Umami, Plausible) or
no analytics at all because:

- It's genuinely cookieless — confirmed directly against Vercel's own
  docs (not assumed): visitor identity is a rotating hash derived from
  IP + User-Agent, discarded after ~24h, no cookie is set, no
  cross-site identifier, data is aggregated (page views, referrers,
  countries) not per-user event tracking.
- Zero new infrastructure — the project already deploys on Vercel; this
  is a first-party integration, not a third-party script/tracker to
  audit and maintain.
- It answers a real, immediate need (does the hosted instance have any
  traffic at all, which pages, roughly from where) without adding any
  privacy surface to reason about.

### Cookie notice: a disclosure, not a consent toggle

`CookieNotice` (`src/components/landing/CookieNotice.tsx`), hosted-only,
shows a one-line dismissible bar: *"This site uses an essential sign-in
cookie and cookie-free, aggregated analytics — no tracking cookies,
nothing sold."* — linking to `/privacy`. Dismissal is remembered in
`localStorage` (not itself a cookie), read via `useSyncExternalStore` to
avoid a hydration-mismatch flash.

This is deliberately **not** an accept/reject picker. The two things a
visitor could conceivably be asked to consent to are:

- Clerk's session cookie — strictly necessary (the product doesn't
  function signed-in without it); GDPR's own strictly-necessary
  exemption means this never requires consent in the first place.
- Vercel Web Analytics — cookieless, so there's no cookie to
  accept/reject; consent frameworks (and their required "reject"
  option) exist to gate a choice, and there is no choice here to gate.

Building a toggle would imply a non-essential, optional tracking
mechanism exists that the visitor can turn off — it doesn't. That would
be a UI shipping a promise the backend can't keep, which is exactly the
failure mode the checklist called out by name.

## Consequences

- **New:** `CookieNotice` + `.module.css`, `@vercel/analytics` dependency,
  both mounted conditionally on `isHosted()` in `layout.tsx`.
- **Self-host:** no analytics, no cookie notice, ever — a self-hoster's
  deployment has no operator-facing telemetry at all.
- **If a genuinely optional, non-essential cookie is ever added** (e.g. a
  third-party embed, a marketing pixel), this decision must be revisited
  — `CookieNotice` would need to become a real accept/reject control at
  that point, not before.
- Documented in `/docs/privacy` (Privacy Policy, hosted section) and
  `/docs/terms` in user-facing language; this ADR is the engineering
  record of why.

## Amendment (2026-09-27): Vercel Speed Insights added, same gate

`@vercel/speed-insights` (`<SpeedInsights />` from `@vercel/speed-insights/next`)
mounted in `layout.tsx` right alongside `<Analytics />`, behind the same
`isHosted()` gate — no separate decision needed since it has the identical
profile this ADR already accepted: first-party (already deploying on
Vercel), no new infrastructure, and per Vercel's own Speed Insights
privacy documentation, anonymous with no cookie and no cross-page/session
identifier (route, approximate device/network/OS, country, and Web Vitals
timing only). `/docs/privacy`'s Analytics paragraph gained a matching
"Performance monitoring" paragraph naming it explicitly, for the same
reason the original Analytics paragraph exists — don't make a user go
find this out from a network tab.
