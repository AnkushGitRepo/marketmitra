# 0070 — Admin users get Unrestricted Mitra and Mitra Advisor on the hosted site

Status: accepted (2026-11-19, issue #243; decided by the maintainer). Amends [0035](./0035-mitra-advisor.md) and [0054](./0054-unrestricted-mitra-local-only.md).

## Context

ADR 0054 made Unrestricted Mitra impossible on the hosted site, and ADR 0035 made Mitra Advisor refuse to run there, because public,
personalised advice carries regulatory risk (in India it can fall under SEBI's investment-adviser rules; a flag, not legal advice) and the
hosted product promises neutral information. The maintainer wants both on the hosted site for themself, as an admin, while ordinary users
never get them.

## Decision

- One server-side question decides it: `canUsePrivilegedModes(userId)` (`src/lib/auth/privilegedModes.ts`), which is `isAdminUser(userId)`
  (ADR 0032). Self-host: always true (one local operator). Hosted: true only for a Clerk user id listed in `ADMIN_USER_IDS`; with no list,
  nobody. The id comes from the session, never from a request.
- **Unrestricted Mitra:** `resolvePromptMode(userId)` returns `guarded` for anyone who cannot use the privileged modes (the stored setting is
  not even read); `PATCH /api/settings/preferences` answers 403 to `chat.unrestricted: true` from them; Settings shows the toggle only to a
  local user or an admin. Everything built on the resolved mode follows: chat, the stock AI read and brief, and the Auto-Chart trade setup
  (ADR 0068).
- **Mitra Advisor:** `isAdvisorEnabled(userId?)` is true when `ADVISOR_MODE=enabled` and (not hosted, or the user is an admin). With no
  user (the scheduler, a signed-out request) it is false on hosted. The explicit env flag stays as the kill switch, so an admin does not
  get the Advisor until it is also set on the host. To everyone else every Advisor page and route is a plain 404.
- **Unchanged:** the thesis-review cron and the local scheduler stay local-only (never registered in `vercel.json` or any workflow, a
  test asserts it); a hosted admin runs the review from the Advisor page. Hosted still never uses the operator's AI key (ADR 0018); an
  admin uses their own, like everyone. The rules in the Advisor and Unrestricted prompts (no position sizes, no return promises, no
  orders, the not-advice note) are unchanged.

## Consequences

- To use them on production: set `ADMIN_USER_IDS` (already used for the system log) and `ADVISOR_MODE=enabled` in the hosted environment,
  then turn Unrestricted Mitra on in Settings. Nothing changes for anyone not in the list.
- The admin's Advisor data (policy, journal, memos) lives in the shared production database under their user id, like any other user's data.
- An admin account is the trust boundary: anyone who can sign in as that user gets the privileged modes. Keep the list short.
- The "impossible on the hosted site" wording in AGENTS.md, ADR 0035 and 0054 is superseded by this ADR for admins only.
