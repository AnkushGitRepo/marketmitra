# 0036 — Full-page Mitra chat: conversations, history and attachments

**Status:** accepted, built (#33)

## Context
Mitra was a floating widget with one persisted thread (100-message cap, `chatMessages`) that only fed the
retrieval layer. The maintainer asked for a modern chat interface — long conversations with history, image/PDF/
audio attachments, a model set up for investing problems — without breaking the project's constraints (BYO key,
no paid tier, identical hosted and self-host behaviour, the guardrail).

## Decision

**Surface.** `/dashboard/mitra` is the full chat (conversation rail + thread + composer). The widget stays for
quick page-aware questions, gains an "Open full chat" link, and is hidden on the full page. The widget's old
single thread is migrated once into a first conversation ("Earlier chat") the first time the list is empty.

**Server-authoritative history.** The client sends only the *new* user message (`POST
/api/mitra/conversations/{id}/messages`); the server loads stored `UIMessage`s, builds the model context and
persists both turns. Two collections: `mitraConversations` (title, running summary, counters) and
`mitraMessages` (one `UIMessage` per row, ordered by `seq`). A client retry after a provider error resends the
last stored user turn; the server detects that (`isRetryOfLast`) and does not save it twice.

**Long conversations.** The newest ≤30 messages / ≤60k characters go to the model verbatim (always starting on a
user turn); anything older is folded into a stored running summary by the user's own model before the turn. If
summarising fails, the gap is kept verbatim rather than forgotten. Tool-call noise is stripped from all but the
last two messages. Titles are derived from the first message (no model call).

**Attachments** (images, PDF, audio, `.txt/.csv/.md`). Uploaded one at a time to `POST /api/mitra/files`
(multipart, ≤4 MB each — under Vercel's 4.5 MB body cap so hosted and self-host agree — ≤6 per message, 50 MB per
user), stored in **MongoDB GridFS** behind a `FileStore` interface. GridFS was chosen over Vercel Blob because it
is free, adds no vendor/token and behaves identically in self-host; a Blob backend can implement `FileStore`
later for larger files. The file type is decided from its **bytes** (magic numbers), not the name or declared
MIME type; SVG/HTML/video are not on the allow-list. Files are owner-only, served with `nosniff` and a sandbox
CSP, with `Range` support (Safari needs it for audio). A message may only reference files that belong to the
caller *and* that conversation; name and type are rebuilt from the stored record, never trusted from the client.
Models receive attachment bytes for the newest 3 user turns that carry files (10 MB budget); older ones become a
short placeholder. Text files are inlined as text.

**Audio.** Gemini reads audio natively; Claude cannot, so a Claude key gets a clear 422 (`attachment_unsupported`)
instead of a silent failure, and OpenRouter is allowed only for Gemini routes. A mic button uses the browser's Web
Speech API for dictation (Chrome/Safari send that audio to their own speech service — the tooltip says so;
nothing goes to MarketMitra). Hidden where unsupported.

**Model setup.** `MITRA_WORKSPACE_SYSTEM`: an investing-research persona for Indian markets with the *same*
non-negotiable `GUARDRAIL` (no buy/sell/hold, no price targets, closing line), the same tool allow-list as the
widget (7 read-only data tools, `search_context`, navigation, screener — nothing for settings/billing/destructive
actions) and attachment rules (cite where in a file a claim comes from, never invent figures). Output cap 4096
tokens. The Advisor's behaviour guard (local-only, ADR 0035) is applied exactly as in the widget.

**Platform data access.** The full-page chat gets `call_platform_api`: GET-only access to every documented
endpoint in `public/openapi.json` (run server-side as the signed-in user, same-origin, 10 s timeout, response capped
at 12k chars). The catalog is derived from the spec, so a newly documented GET route becomes reachable
automatically; the endpoint list is injected into the system prompt. **Deliberately excluded:** every non-GET
(writes/deletes), `/api/settings/*` (key and channel config), `/api/cron/*`, `/api/advisor/*` (local-only, own gated
tools), `/api/mitra/*`, `/api/system/logs`, exports, `/api/mcp`, `/api/ai/*`. This keeps ADR 0022's invariant (no
tool for settings/security/billing/destructive actions) and a test asserts it against the real spec. Path and
query are re-validated against the catalog (segment charset, declared params only), so the tool cannot be steered
to another host or an undocumented route. On any turn that has an attachment in context the existing alert-write
tools (`create_alert`, `update_alert_params`, `set_alert_status`) are withheld, and the prompt tells the model to
treat attachment content as data, never instructions (prompt-injection hardening).

**Rendering.** `MarkdownLite` gains pipe tables, numbered lists, fenced/inline code and rules. It still emits only
React text nodes — no links, images or HTML — so model output cannot inject markup.

## Consequences
- New collections `mitraConversations`, `mitraMessages` and GridFS bucket `mitraFiles` (`.files`/`.chunks`).
  Limits live in `src/lib/mitra-chat/limits.ts` (200 conversations/user, 2000 messages/conversation).
- Deleting a conversation deletes its messages and files. An unsent attachment can be removed on its own.
- Attachments count against the Atlas free tier (512 MB shared): the 50 MB/user cap is the guard.
- The widget's `chatMessages` store and `POST /api/ai/chat` are unchanged (they still feed retrieval).
- Not built: PDF text extraction for attachments that have scrolled out of the 3-turn window (they become a
  placeholder), resumable streams after a refresh, message editing/branching, sharing.

## Review follow-ups (independent review, 2026-11-10)
Fixed: write tools withheld on attachment turns; only completed replies are stored (so a retry is detected and
never duplicated); a retry resends attachments as text-only placeholders; file size checked from metadata before
bytes are read; upload rejected from `Content-Length` before buffering; indexes created; client race when switching
conversations and deleting a just-created one. **Known and accepted for now:** the 50 MB quota check is not atomic
(parallel uploads can overshoot it), self-host has no rate limiting without Upstash, a malformed-but-plausible file
can fail on every normal turn until a retry or until it leaves the 3-turn window, `Range` requests buffer the whole
file, two simultaneous first visits could create two "Earlier chat" conversations, and conversation summaries
persist attachment-derived text in the system prompt.

## Dictation permission handling (#38)
The site's `Permissions-Policy` originally said `microphone=()`, which disables the mic for every origin: the
browser never showed a prompt and no per-site setting could help, so dictation always ended in "blocked". It is now
`microphone=(self)` (camera, geolocation, payment, USB and Bluetooth stay off; a test pins this). Starting dictation
checks the Permissions API first: undecided → the native prompt is requested; denied → a help dialog shows the
steps for the detected browser (Chrome/Edge/Brave/Safari, plus the OS-level switch) and starts dictation by itself
when the permission flips to granted. Insecure contexts, a missing microphone and Brave (no speech service) get their
own messages. Web pages cannot open the browser's settings screen; guided steps are the closest possible.

