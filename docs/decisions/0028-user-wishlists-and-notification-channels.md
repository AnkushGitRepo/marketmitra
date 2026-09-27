# 0028: Per-user Markets wishlists, and self-serve Slack/Telegram/WhatsApp/webhook alert channels

Date: 2026-09-27
Status: accepted, built, verified locally.

## Context

Two independent asks landed together and share the same "let the user own
this, not the operator" shape, so one ADR covers both.

**Markets page.** The "Top gainers (watchlist) / Top losers (watchlist)"
panel derived from a single hardcoded `WATCHLIST` constant
(`src/lib/dashboard/watchlist.ts`) — the same fixed list every user saw,
with no way to add or remove a stock. Asked to replace it with something
the user actually curates: multiple named wishlists, each holding whatever
stocks they choose.

**Alerts page.** External delivery was previously operator-wide only:
`ALERT_WEBHOOK_URL`/`ALERT_EMAIL_TO` env vars (ADR 0014 §2), one webhook
for every user on a self-hosted instance, generic enough to *sort of* work
for Telegram/Discord/Slack incoming webhooks but not shaped for any of
them specifically, and with no per-user choice at all on the hosted
instance. Asked for real, user-configurable channels — Slack, Telegram,
WhatsApp among them — set up from the Alerts page itself.

## Decisions

### Wishlists — new per-user collection, not an extension of the alert/note pattern

`userWishlists` (Mongo): `{ userId, name, symbols: string[] }`, capped at
20 wishlists/user and 50 symbols/wishlist. CRUD mirrors `userNotes.ts`'s
shape exactly (`listWishlists`/`createWishlist`/`renameWishlist`/
`deleteWishlist`/`addSymbol`/`removeSymbol`) — same file layout, same
`ObjectId.isValid` guard-before-query convention, same per-user cap
pattern. `addSymbol` dedupes via `$addToSet` semantics implemented at the
app layer (checked before the cap, so a repeat add of an existing symbol
is a no-op success, not a wasted slot).

The Markets page keeps rendering live prices the same way it always did —
`getQuotes(symbols)` (existing, `src/lib/dashboard/quotes.ts`), called
once server-side with every symbol across every one of the user's
wishlists batched together, not once per wishlist. `WishlistPanel.tsx` is
a client component that owns tab selection, the add-stock search (reusing
`SearchResultsDropdown`/`/api/search`, filtered to `type === 'company'`
since a wishlist is stocks, not indices), and every mutation, always via
`router.refresh()` afterward rather than a hand-rolled optimistic local
copy of the list — deliberately: with `wishlists` treated as the single
source of truth from the server-refreshed prop (same as
`NotesPageClient`), a delete/rename is correct the moment the prop
updates, with no separate local-state reconciliation effect needed (one
was tried and correctly rejected by `react-hooks/set-state-in-effect` —
see the commit history).

**Scoped to the Markets page only.** The dashboard home page's own
gainers/losers panel (`DashboardPageClient.tsx`, same `MoverPanel`/
`getTopMovers` machinery) was explicitly out of scope for this ask and
was left untouched — it still reflects the fixed `WATCHLIST`.

### Notification channels — per-user, stored in the existing `userSettings` doc, real APIs not a relabeled generic webhook

Extended `userSettings.ts` (already the one-doc-per-user settings
collection carrying the BYO AI key) with `slackWebhookEnc`/
`telegramBotTokenEnc`/`telegramChatId`/`whatsappWebhookEnc`/
`customWebhookEnc` — encrypted at rest with the same `crypto.ts`
AES-256-GCM helper as the AI key, gated the same way behind
`SETTINGS_ENC_KEY` (`isEncKeyConfigured()`, 503 if unset). Reusing one doc
per user, rather than a second collection, means `clearAiSettings` could
no longer `deleteOne` the whole document (that would silently wipe a
user's saved channels too) — changed to `$unset` just the AI fields, a
real behavior fix caught while making this change, not a pre-existing bug
report.

**Slack and Telegram get real, correctly-shaped senders** (`channels.ts`):
`sendSlack` posts the `{text}` shape Slack's incoming-webhook API actually
expects (not the app's generic `{kind,title,body,href,meta}` JSON, which
Slack accepts but renders as nothing useful); `sendTelegram` calls the
real Bot API `sendMessage` endpoint with `chat_id`/`text`/
`parse_mode: Markdown`, escaping Telegram's Markdown-v1 special
characters in title/body. Verified against the **real** Slack and
Telegram APIs with a throwaway fake URL/token (not mocked) — Slack
returned its own real `no_team` error, Telegram its own real
`{"ok":false,"error_code":401,"description":"Unauthorized"}` — proof both
requests are correctly formed and reaching the real service, failing only
because the test credentials are fake.

**WhatsApp is honestly not a real built-in integration** — there is no
free, keyless "send a WhatsApp message" API. `sendWhatsapp` relays through
the same generic JSON shape `sendWebhook` already posts, to a URL the user
supplies (a Twilio Function, a CallMeBot-style relay, a Zapier/Make
webhook that forwards to their number). The Alerts-page UI says this
explicitly rather than implying MarketMitra talks to WhatsApp directly.

`resolveChannels(userId)` (`deliver.ts`) now reads the user's stored
settings first; the deployment-wide `ALERT_WEBHOOK_URL` env var survives
as a fallback for the generic webhook slot only (so an existing
self-hoster's env var keeps working with zero migration), email is
unchanged from ADR 0014. Every existing call site
(`src/lib/alerts/evaluate.ts`, already per-`alert.userId`) picks this up
with no changes of its own.

**A real "send test" round-trip**, not just a save button:
`POST /api/settings/notifications/test` sends one real notification
through one already-saved channel and returns the actual `ChannelResult`,
so a user can confirm delivery before relying on it — the same standard
this repo holds itself to for every other feature ("verified live", not
assumed).

## Consequences

- Two new Mongo collections/fields, both additive — no migration needed
  for existing `userNotes`/`alerts`/`userSettings` documents.
- `docs/api-surface.md` gains 6 endpoints; `public/openapi.json` updated
  to match (the repo's own `openapi.test.ts` CI check enforces this).
- The Markets page's dependency on `WATCHLIST`/`getTopMovers` is now
  Markets-page-local history only — the dashboard home still uses it, a
  deliberate scope line, not an oversight, flagged here so a future
  session doesn't "finish the job" without being asked.
- WhatsApp delivery quality depends entirely on whatever relay the user
  points it at — MarketMitra can't verify or guarantee that leg, and the
  UI says so.
