# 0026: Collapsible left sidebar replaces the top tab bar

Date: 2026-09-20
Status: accepted, built, verified locally.

## Context

The top navbar (`AppHeader`) held 11 nav items in a single horizontal pill
row (Dashboard, Portfolio, Markets, Screener, Alerts, News, IPOs, Research,
Agents, Notes, API — the last of these, Screener, Research, Agents, and API
all added across Phases 9-11 and the Screener build, none removed). At
1240px content width the row was visibly out of room — "API" nearly
clipped at the right edge — and there is no realistic number of further
dashboard sections this shape could absorb without either shrinking the
labels illegibly or wrapping.

## Decision

Move all 11 nav items into a collapsible left sidebar (`Sidebar.tsx`),
shared across every `/dashboard*` route via `AppShell.tsx` — not
per-page. The sidebar and the content column (header + page content) are
flex siblings under `.shell`, so the content column's existing
`max-width: 1240px; margin: 0 auto` centering keeps working unmodified
against whatever width remains once the sidebar's own space is accounted
for — no per-page width math needed.

- **Expanded** (240px): logo/wordmark + icon + label per item.
- **Collapsed** (76px, toggled by a chevron button): icon-only rail, logo
  mark only (wordmark hidden).
- Collapse state persists to `localStorage` (`mm-sidebar-collapsed`) via
  `useSyncExternalStore` — the same pattern `CookieNotice.tsx` already
  uses for a localStorage-backed preference, chosen specifically so
  reading the stored value can't produce a hydration-mismatch flash (the
  server snapshot is always "expanded"; React reconciles the real client
  value once mounted). `useState` + `useEffect` was tried first and
  rejected — `react-hooks/set-state-in-effect` correctly flags a
  synchronous `setState` in an effect body as the wrong tool for
  synchronizing from an external store.
- Active-route styling reuses the existing dark-pill treatment
  (`--app-ink` background, `--app-cream` text) that `AppHeader`'s nav
  already used — no new visual language invented.
- **Mobile (≤760px) is unaffected** — the sidebar hides entirely via CSS
  at the same breakpoint `AppHeader`'s mobile header and `MobileTabBar`
  already use, and the existing 5-item bottom tab bar (Dashboard,
  Portfolio, Markets, Alerts, News — the primary flows) continues to serve
  navigation there, unchanged. Screener/IPOs/Research/Agents/Notes/API/
  Settings stay reachable on mobile via the compact header's search and
  in-page links, same as before this change — expanding the bottom bar to
  all 11 items was out of scope; it was explicitly speced as a
  tablet/desktop-only sidebar.
- The brand/wordmark moved out of the desktop top bar into the sidebar's
  top; the mobile compact header keeps its own brand mark (it has no
  sidebar to hold one).
- Top bar (`AppHeader`) now spans only the content column, not the full
  window, and keeps: search, notification bell, the settings gear
  (`/dashboard/settings` — AI provider key configuration, a real distinct
  feature from account management), the ₹ mask toggle, and the profile
  avatar (Clerk `UserButton` in hosted mode / a local "LU" badge in
  self-hosted mode).

### Not built: a sun/moon theme toggle

The initial spec for this change listed a "theme toggle (sun/moon icon)"
as top-bar content. Investigation found no dark mode anywhere in the app —
`docs/design-system.md` is explicit that this is a single warm/light
palette, with dark tokens (`--color-surface-dark` etc.) used only as
accents (footer, CTA buttons), never as a whole-page theme. The user
clarified the "sun icon" in the reference screenshot was a misreading of
the existing settings gear icon (which routes to `/dashboard/settings` for
AI provider key setup) — there was never a real theme toggle to relocate.
No dark-mode work was done; the gear icon's existing behavior is
unchanged.

### Fixed alongside: profile avatar clipping (`HostedUserBadge.tsx`)

The Clerk `UserButton`'s custom `appearance.elements` override set
`userButtonBox: { flexDirection: 'row-reverse' }` without `minWidth: 0`.
Flex items default to `min-width: auto`, so the identifier-name text
refused to shrink below its content width and overflowed past the pill
instead of eliding — visually spilling text near/over the circular avatar
next to it, with the avatar itself appearing squeezed. Fixed by adding
`minWidth: 0` to `userButtonBox` and to `userButtonOuterIdentifier` (plus
`overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap` on the
latter so it truncates instead of overflowing), `flexShrink: 0` +
explicit `overflow: hidden; borderRadius: 50%` on `avatarBox` so the
avatar keeps its full circular size and clips its image, and
`objectFit: cover` on `avatarImage`. Not re-verified against a real Clerk
session locally — local dev runs in self-hosted mode
(`NEXT_PUBLIC_DEPLOYMENT_MODE=selfhost`), which renders the plain "LU"
badge, not `HostedUserBadge`. Needs a real look in hosted/production
before being called fully confirmed.

## Consequences

- Nav item count is no longer width-constrained by the top bar — adding a
  12th dashboard section is just another `NAV_ITEMS` entry.
- `NavIcons.tsx` and `navItems.ts` are new shared files under
  `src/components/appshell/`; `MobileTabBar.tsx` was refactored to import
  its 5 icons from `NavIcons.tsx` instead of duplicating them, so the
  sidebar and the mobile tab bar can't visually drift apart on the items
  they share.
- No page-level changes were needed for the width adjustment — every
  dashboard page's card grids already use
  `grid-template-columns: repeat(auto-fit, minmax(Npx, 1fr))`, which
  reflows correctly at any container width by construction. Verified in
  the browser at 1440px (expanded and collapsed sidebar) and 390px
  (mobile).
