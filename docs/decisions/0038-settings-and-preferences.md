# 0038 — Settings page rebuild and per-user preferences

**Status:** accepted, built (#37)

## Decision
`/settings` is a sectioned page (section list + cards, deep links `#ai`, `#chat`, `#display`, `#notifications`,
`#shortcuts`, `#data`, `#about`):

1. **AI & API keys:** the existing encrypted BYO key form (provider, model, test & save, remove). Unchanged storage
   (`userSettings`, AES-256-GCM); the key is never returned to the browser.
2. **Mitra chat:** let Mitra read platform data (off = `call_platform_api` is not offered and its endpoint list is not
   in the prompt), send with Enter vs Ctrl/Cmd+Enter, show tool-activity chips, dictation language.
3. **Display:** hide portfolio values by default.
4. **Notifications & alerts:** the existing channels card and the guardrail toggle, reused (still on `/alerts` too).
5. **Keyboard shortcuts:** global on/off plus the reference list (from the same registry as the `?` dialog).
6. **Data & privacy:** export all my data (JSON), delete all Mitra conversations (messages and files), clear the widget
   history.
7. **About:** deployment mode, links, and (admins only) a link to the hidden System page.

## Preferences
Stored per user in `userPreferences` (`{ userId, prefs, updatedAt }`). `src/lib/preferences/schema.ts` is the single
definition: every field has a default, so missing, partial or invalid stored data resolves to a complete valid object
(one bad field does not discard the others). `PATCH /api/settings/preferences` accepts any subset and **rejects unknown
keys** so typos are not silently dropped. `getPreferences` never throws (falls back to defaults) because the app layout
reads it on every page. Preferences are applied where they matter: the chat route (platform access), the app layout
(shortcuts, hide-values), and the Mitra page (send key, chips, dictation language).

## Export
`GET /api/settings/export` returns one versioned JSON attachment: holdings, notes, alerts, wishlists, Mitra
conversations (attachments by reference only) and preferences, with internal `userId`s stripped. **Never included:**
AI keys and notification channel secrets. `/api/settings/*` stays on the chat tool's deny-list (ADR 0036), so Mitra
cannot read or change settings.

## Consequences
New collection `userPreferences`; new routes `GET|PATCH /api/settings/preferences`, `GET /api/settings/export`,
`DELETE /api/mitra/conversations` (all in `openapi.json`). The layout now does one extra small read per page load.
Not built: theme/dark mode, per-device preferences (these are per account), scheduled auto-deletion of chats.

## Account & security section (#53)
Settings gains an **Account & security** section first. Hosted: identity-aware controls built on Clerk's own components
rather than re-implementing them: **Manage** opens Clerk's profile dialog (so username, email/phone, password,
passkeys, two-factor, connected accounts, active devices and account deletion appear exactly as enabled on the Clerk
instance, with no code change when a feature is switched on), **Sign out**, and **Accounts on this device** (list,
Switch, per-account sign out, Add account, Sign out of all). Sign out is therefore reachable on phones, where the
header has no account button. A "secondary" or "family" account is simply another Clerk user: its own MarketMitra
data, no shared household view (that would be a separate feature). Self-host shows a note (single local user).

**Dashboard prerequisites (code cannot set these):** *Sessions > Multi-session handling* must be on for adding and
switching accounts (the UI says so when it is off), and *Multi-factor* needs *Authenticator app* (and *Backup codes*)
enabled for two-factor. SMS two-factor is a Clerk Pro feature and needs phone numbers enabled first.

