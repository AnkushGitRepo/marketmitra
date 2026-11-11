# 0050 — Settings: a tabbed hub, a trustworthy key card, a fenced danger zone

Status: accepted (2026-11-11, issue #87)

## Context

`/settings` was one scroll of eight stacked cards with an in-page link list beside the app sidebar. The AI-key card had no
connection test or feedback; irreversible actions (delete all conversations, clear widget history) sat inline next to Export
behind a casual two-step confirm; and Guardrails, Notification channels and Email alerts were configured both here and on
`/alerts`, so the two could drift.

## Decision

- **Tabs** (`SettingsTabs`): Account, AI & Models, Preferences, Alerts & Channels, Data & Privacy as one segmented bar at every
  width (scrollable on phones: no second sidebar beside the app's own). Only the selected panel is rendered. The tab lives in
  `?tab=` and survives reload. **Old anchors keep working** (`resolveTab`): `#ai`, `#chat`, `#display`, `#notifications`,
  `#shortcuts`, `#data`, `#account`, `#about` open the tab that now holds that content; the designed emails link to
  `/settings#notifications`. `tablist` semantics with arrow / Home / End keys.
- **AI & Models** (`AiPanel`): status (Connected with provider, model and the last four characters, or Not connected), an accurate
  note (AES-256-GCM at rest, used only on the server, only the last four characters ever shown), **Test connection**
  (`POST /api/settings/ai/test`: tests the *stored* key with a 16-token request and returns provider, model and measured latency;
  the key is never in the response; rate limited), **Change key** (form collapsed until asked), **Remove key** behind a confirm,
  and the Mitra permission toggles. Preferences are held once in the tab shell, so a toggle on one tab is current on the other.
- **Preferences**: display (hide values by default, which also applies to the current session at once via `setMasked`, with a
  live "amounts are hidden/visible" line), chat input, keyboard shortcuts as the enable switch plus "View all shortcuts", which
  opens the existing `?` sheet through a `window` event. The permanent shortcut list is gone.
- **Alerts & Channels**: a read-only summary (email alerts with masked address or why it cannot send, guardrails, connected
  channels) and a link to `/alerts?settings=1`, which opens the Alert settings drawer. The controls now exist in one place.
- **Data & Privacy**: Export is a prominent primary button. A red-bordered **Danger zone** holds the two destructive actions;
  each opens a modal where the confirm button stays disabled until `DELETE` is typed exactly (`isPhraseConfirmed`).
- **About** (mode, billing, links) moves to the bottom of the Account tab.

## Deviations from the request

- **No "Reveal" for the API key.** A saved key never goes back to the browser; revealing it would mean sending it. Only the last four
  characters are shown, and Change key replaces it.
- **No context-window or tier badges** on the model picker (the data is not in the app and would have to be invented), and
  **no "Healthy" status until you press Test connection** (an unmeasured status is not shown).
- Alerts & Channels is a summary plus link rather than a second copy of the controls: one copy cannot drift. Horizontal tabs, not a
  left rail. CSS Modules, not Tailwind (ADR 0003).

## Consequences

`SettingsClient`, `PreferencesSections` and `DataSection` are removed. The shared `ConfirmDialog` and the new
`TypedConfirmDialog` set `margin: auto`, because the app's global reset otherwise pins a modal `<dialog>` to the top-left.
Testing the connection spends a few tokens of the user's own key.
