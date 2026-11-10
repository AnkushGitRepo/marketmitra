# 0037 — App pages at `/[page]`, not `/dashboard/[page]`

**Status:** accepted, built (#39)

## Decision
`/` stays the public landing page and `/dashboard` stays the app home. Every other app page moves to the top
level (`/portfolio`, `/markets`, `/screener`, `/ipos`, `/news`, `/research`, `/agents`, `/notes`, `/alerts`,
`/mitra`, `/mitra-activity`, `/advisor`, `/settings`, `/system`, `/stock/[ticker]`, `/index/[name]`). The API
reference becomes `/api-docs`, because a top-level `/api` page would sit beside the `/api/*` route handlers.

## How
- Pages live in the route group `src/app/(app)/` so they keep the shared app-shell layout while the group name
  stays out of the URL. `(app)/dashboard/` holds the home page.
- `src/lib/routes.ts` is the single registry (`APP_PAGE_SEGMENTS`) and builds the legacy redirect table:
  every old `/dashboard/<page>` URL 308-redirects to `/<page>` (alert emails, bookmarks and shared links keep
  working; query strings are preserved).
- `src/proxy.ts` protects the same list in hosted mode. Next requires `config.matcher` to be a static literal, so
  it cannot import the list; `routes.test.ts` fails if a page folder, the redirect table and the proxy ever
  disagree. **Adding a page = add a folder under `(app)/`, add it to `routes.ts` and `proxy.ts`.**

## Consequences
- Top-level page names are now reserved against future public pages (`/status`, `/privacy`, `/terms`,
  `/sign-in`, `/sign-up` stay public and outside the group).
- Not changed: `/api/*`, the `@/lib/dashboard/*` module folder, Clerk redirect targets (`/dashboard`).
- History (`session-log.md`, `docs/archive/`) still says `/dashboard/<page>`; those entries are accurate for
  their date.
