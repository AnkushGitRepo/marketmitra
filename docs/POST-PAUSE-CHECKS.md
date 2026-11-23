# Post-pause checks — what to run once the app is online again

> **Temporary file. Delete it (and its pointer in `AGENTS.md`) when every item below is done and reported.**
> Vercel has paused every project until **12 December 2026** ([HANDOFF](./HANDOFF.md)), so the changes below are merged or ready but
> **unverified in production**. When the app is deployable again, an agent runs this list, ticks each item with the date and the result,
> and tells the maintainer what passed, what failed and what was skipped (AGENTS.md rule 8).

## How to keep this file

- **Add** an item whenever you ship something that cannot be checked in production yet. Say what to check, where, and what "good" looks like.
- **Tick** an item only after you actually ran it: `- [x] 2026-12-12: result`. A failure stays unticked with the output and an issue link.
- **Never** deploy, set Vercel environment variables or run production migrations without the maintainer's explicit go-ahead (AGENTS.md safety rules). Steps marked 🔒 need it.
- **Delete** the file in a `docs/` PR once everything is ticked, and remove the pointer lines in `AGENTS.md` (Start here, Docs map).

## 0. Before deploying

- [ ] Vercel is unpaused (the maintainer says so, or a `vercel ls` works). Do not assume the date.
- [ ] Open PRs are merged in order: #286 (IPO brief research) then #288 (IPO brief speed). Check `gh pr list` for anything newer.
- [ ] `git log --oneline -10` on `main`; the checks `build` and `python` are green on `main`.
- [ ] Read HANDOFF's "Where we are" and "Waiting on the Vercel account being unpaused" first; they may have changed.

## 1. Environment 🔒 (production project `marketmitra-v2`)

- [ ] `ADMIN_USER_IDS` = the maintainer's Clerk user id (ADR 0070). Closed when empty.
- [ ] `ADVISOR_MODE` = `enabled`.
- [ ] `AI_PROVIDER` + `AI_API_KEY` (and optional `AI_MODEL`) for the **deployment's** key. This is what the `ipo-briefs` job and shared IPO briefs use (ADR 0018 §5). **Decision for the maintainer first:** it spends their key on every open IPO every two hours; Gemini is needed for web-search research.
- [ ] `CRON_SECRET` is set on Vercel and as the GitHub secret of the same name (the workflows `evaluate-alerts`, `index-corpus` and `ipo-briefs` use it).
- [ ] `FUNDAMENTALS_API_URL` still points at Cloud Run (not the old paused Vercel data service).

## 2. Deploy and smoke 🔒

- [ ] `npm run deploy:prod` (deploys `main` as it is, no new version, ADR 0059).
- [ ] `bash scripts/smoke-test.sh` passes; `GET /api/version` reports the commit that was deployed.
- [ ] Production, not memory: open the site signed out and signed in and look at the dashboard, a stock page, `/ipos`, `/funds`.

## 3. Mutual funds redesign (#272–#282; data service already live, app not)

- [ ] `/funds` opens on diversified funds sorted by Sharpe; the "Include sector & thematic funds" box brings the rest back; a name search shows everything.
- [ ] The four lenses (Core index, Strong risk-adjusted returns, Low volatility, Tax saver) set ordinary filters; "More filters" has the worst-fall limit.
- [ ] Tick up to three funds, open `/funds/compare?codes=…`: trade-off summary, Growth of ₹10,000 chart (1Y/3Y/5Y), grouped rows, **+ Add fund**, the portfolio-in-sector row (signed in with holdings).
- [ ] A fund page shows the Mitra Fund X-Ray with a saved AI key (guarded wording, no pick/avoid), and its peers are grouped by theme.
- [ ] `GET /api/funds?exclude_thematic=true` and `/api/funds/compare` answer; `max_fall_3y` filters.
- [ ] Cloud Run cold start with the app in front of it feels fine (the first `/funds` load after idle).

## 4. IPO brief (#284, #287)

- [ ] On `/ipos`, expand a live IPO and **Generate brief**: business, offer (fresh issue vs OFS, use of proceeds) and key risks are real, nothing says "Not available in our data" without a reason, and it takes seconds, not minutes. Note the time.
- [ ] **Reload the page**: the brief is still there (cache on reload).
- [ ] Open the same IPO as a second, non-admin account: the same brief appears without a new generation (shared cache).
- [ ] As a non-admin the brief has **no** Listing call / Long-term call and no "Unrestricted" badge.
- [ ] As the admin with Unrestricted Mitra on: the brief adds the two calls, the badge shows, and it is stored apart from the shared one (the non-admin still sees the guarded one).
- [ ] Run the `ipo-briefs` workflow by hand (`gh workflow run ipo-briefs`): the run is green and the response counts `generated` / `alreadyFresh` / `failed` look right; with no `AI_API_KEY` it says it skipped. Check the System page event log for `cron:ipo-briefs`.
- [ ] After the schedule has run once, a fresh IPO card opens with its brief already written.
- [ ] Spot-check one brief's figures (fresh issue vs OFS, P/E vs peers) against the prospectus or the exchange; the search tool's facts were not verified at build time.

## 4b. Category-wise IPO subscription (#285, ADR 0074)

- [x] 2026-11-21: the maintainer ran `alembic upgrade head` on production Neon (`f2a6c8d41b95`, via the Secret Manager connection string) and the data service runs revision `00008-rjn`.
- [x] 2026-11-21: after a `refresh-ipos` run, `GET /ipos` returns the category fields for the 3 open and closed IPOs; Watrana Rentals matches the aggregator's page exactly (retail 15.42x, small NII 13.23x, big NII 23.39x, as of 20 Nov 17:56 IST). Re-check one when a new IPO opens.
- [x] 2026-11-21: the run logged "category-wise subscription read for 3 IPOs" (3 open or closed) and the whole job took about 30 s.
- [ ] On `/ipos`, an open IPO's details show the category table (multiples, smallest application, estimated odds) with the "as of" time; an upcoming IPO shows no table.
- [ ] The brief quotes the category demand as numbers and does **not** say which category to choose when guarded; as the admin with Unrestricted Mitra on it adds the "Best category" item.
- [ ] Sanity-check the odds on one closed IPO against its real basis of allotment (retail applications allotted / applied) to see how far the 1 / subscription estimate is off.

## 4c. First-run onboarding wizard (#306, ADR 0075)

- [ ] Signed in as a brand-new hosted user (no holdings): the first page load goes to `/onboarding`; a user who already has holdings is not redirected and ends up with `onboarding.completed` set.
- [ ] Step 1 saves a profile; adding a holding afterwards creates alerts with that profile's trailing-stop and drawdown percentages (Alerts page).
- [ ] Step 2: a Zerodha-style CSV and an XLSX preview, confirm and appear in Portfolio; the quick add (search, qty, price) saves; the Portfolio concentration card names a stock above the profile's limit.
- [ ] Step 3: a real Gemini key saves and shows "Connected (model, latency)"; a wrong key shows the failure message; "Finish without AI" works with no key.
- [ ] The closing screen after "Launch" shows the right recap (profile, analysts queued, provider) and its buttons go to /dashboard (the dark default), /portfolio and /agents.
- [ ] "Skip setup", "Skip for now" and "Finish without AI" never trap you; the wizard does not return after either. `/onboarding/demo` writes nothing (check no new holdings or analysts).
- [ ] The Clerk handshake works for `/onboarding` (it is in the `proxy.ts` matcher).

## 5. Admin modes (#243, ADR 0070)

- [ ] Signed in as the admin: Settings > AI & Models offers Unrestricted Mitra; `/advisor` opens after the disclaimer; the System page and event log are visible; AI Auto-Chart shows the trade setup.
- [ ] A **second, non-admin account**: the unrestricted setting is refused (403), `/advisor` is a 404, the System page is not available, Auto-Chart shows market structure only.

## 6. Data service and hosting follow-ups (#169, #180)

- [ ] Vercel CPU re-measured: Team Usage > Fluid Active CPU > Projects. The old `marketmitra-fundamentals-api` should be about 0.
- [ ] Cloud Run cost and the ₹1,500 budget alert are fine after the funds changes.
- [ ] Ask the maintainer about deleting the paused Vercel data service and rotating the Neon password afterwards (HANDOFF open follow-ups).

## 7. Close out

- [ ] Close #220 (mutual funds) with a comment pointing at the HANDOFF section, once section 3 passes.
- [ ] Update HANDOFF "Where we are" and add a session-log entry: what passed, what failed, what was skipped.
- [ ] Anything that failed has an issue. Then delete this file and the `AGENTS.md` pointers.
