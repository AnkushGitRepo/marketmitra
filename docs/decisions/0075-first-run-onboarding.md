# 0075 — First-run onboarding wizard

Status: accepted (2026-11-23, issue #306; the maintainer approved the plan and the three decisions below).

## Context

A new user lands on an empty dashboard with no holdings, no AI key and no risk settings. The proposed fix was a three-step wizard (risk profile,
holdings, AI key) with a demo portfolio. Three parts of the proposal did not fit the project and were changed:

- **"Free quota: 20 AI calls a day"** is not a platform feature. AI runs only on the user's own key; the 20 a day is the hosted cap on that key
  (`DAILY_AI_CAP`). A free tier or trial would break ADR 0011/0016. The AI step therefore offers "save and test a key" or "finish without AI",
  and says plainly that there is no quota and that the hosted cap is 20 whether or not the key is the user's own.
- **"Initialise the Advisor policy"** cannot apply to most users: the Advisor is local-only or hosted-admin-only (ADR 0035, 0070), and its policy
  needs a monthly contribution, a horizon and a target allocation that the wizard does not ask for. Writing guessed values would be inventing
  data, so the wizard does not touch the Advisor policy at all.
- **A demo that writes holdings** would spawn analysts and default alerts that spend the user's key, in their real account.

## Decision

- **Where it lives:** `/onboarding` (full screen, outside the `(app)` shell, auth-protected in `proxy.ts`) and `/onboarding/demo`. The `(app)`
  layout redirects a user with no holdings and no flag to `/onboarding` (`lib/onboarding/gate.ts`). A user who already has holdings is stamped
  `completed` once and never asked. If holdings cannot be read, nothing redirects. Skipping (`dismissed`) or finishing (`completed`) stops it for good.
- **State:** a new `onboarding` group in user preferences: `riskProfile` (null until chosen), `completed`, `dismissed`. `POST /api/onboarding`
  saves them and returns the holdings count, whether a key is saved and how many analysts will actually do work (zero without a key or with
  automatic analysts off), so the closing message never over-claims.
- **Risk profile** (`lib/onboarding/profiles.ts`): Conservative, Balanced, Aggressive. Only numbers the app enforces are shown: the trailing-stop
  and drawdown percentages of the default alerts created for each new holding (`lib/alerts/guardrails.ts`; with no profile chosen the original
  10% / 15% stay), and a single-stock limit that the portfolio page's concentration card names a stock against
  (`buildRiskCards(..., { maxPositionPct })`). The proposal's "70% index core" figures were left out: nothing enforces them for an ordinary user.
- **Holdings:** the existing import (`portfolio-import/extract` then the review-and-confirm card; CSV and XLSX only, since those need no AI key)
  and `POST /api/holdings`, so guardrails and analysts follow the usual rules. The file is parsed on the server, not in the browser. Broker names
  are not promised in the copy: only "a symbol, quantity and average price column".
- **AI key:** the existing `PUT /api/settings/ai` and `POST /api/settings/ai/test`. The test checks the stored key, so the button is "Save and test".
- **Demo:** a static, clearly labelled sample (`lib/onboarding/demoPortfolio.ts`) rendered read-only with the real risk cards. No database access,
  no analysts, no AI calls. The prices are made up and the page says so.

## Consequences

- No Playwright setup exists in the repo, so the flow is covered by unit and route tests plus a manual browser check, not an end-to-end test.
- A transient preferences read failure returns defaults, so a user who had skipped the wizard and has no holdings could be sent to it once.
- The `existing` stamp writes one preferences field for every long-standing user on their first page view after deploy.
