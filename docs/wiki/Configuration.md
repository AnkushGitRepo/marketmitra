# Configuration

All configuration is environment variables. The app reads `.env.local` (copy it from `.env.local.example`); on Vercel, set them in the project settings. Variables for the data service live in `services/fundamentals-api/.env`.

> **Rule of thumb:** only the first three variables are needed for a working self-hosted install. Every other variable switches on an optional feature, and an unset variable disables that feature instead of breaking the app.

## Core

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_DEPLOYMENT_MODE` | no (default `selfhost`) | `hosted` turns on Clerk sign-in and the hosted-only behaviours; `selfhost` is a single local user. **Restart `npm run dev` after changing it.** |
| `MONGODB_URI` | **yes** | MongoDB connection string. |
| `MONGODB_DB` | no (default `marketmitra`) | Database name. |
| `FUNDAMENTALS_API_URL` | **yes** | Base URL of the data service. Local default `http://localhost:8420`. |

## Shared secrets

Each secret must have the **same value** on every component that uses it.

| Variable | Shared between | Guards |
| --- | --- | --- |
| `IPO_INGEST_TOKEN` | app ↔ data service (and the IPO refresh workflow) | `POST /embed`, `POST /documents/extract-text`, `POST /ipos/ingest`. Without it, retrieval is off and chat falls back to a summary. |
| `SCREENER_INGEST_TOKEN` | app ↔ data service ↔ screener workflow | `POST /screener/quotes`, `POST /screener/ingest`, `GET /screener/stale`. |
| `CRON_SECRET` | app ↔ GitHub Actions | Every `/api/cron/*` route. Unset: open in dev, refused (503) in production. |

Generate any of them with `openssl rand -hex 32`.

## Alerts and notifications

| Variable | Purpose |
| --- | --- |
| `ALERT_WEBHOOK_URL` | One URL every triggered alert is POSTed to (Telegram, Discord and Slack webhooks work). Optional; in-app notifications always work. |
| `RESEND_API_KEY` | Turns on email delivery via Resend. |
| `ALERT_EMAIL_TO` | Self-host recipient. (Hosted mode uses the signed-in user's email.) |
| `ALERT_EMAIL_FROM` | Sender. The default `onboarding@resend.dev` only reaches the Resend account owner — use a verified domain for real sending. |

Per-user Slack, Telegram, WhatsApp and webhook channels are configured in the app under Settings ([ADR 0028](Decision-Records)).

## AI

| Variable | Purpose |
| --- | --- |
| `SETTINGS_ENC_KEY` | 32 bytes, base64. Encrypts users' AI keys at rest (AES-256-GCM). `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AI_PROVIDER` | `gemini` \| `anthropic` \| `openrouter`. Self-host fallback key. |
| `AI_API_KEY` | Fallback key used only when a self-hosted user hasn't saved their own. |
| `AI_MODEL` | Optional model override. |

In **hosted** mode there is no operator fallback: every user must bring their own key.

## Hosted mode only

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk application keys. |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL`, `NEXT_PUBLIC_CLERK_*_FALLBACK_REDIRECT_URL` | Sign-in/up routing (`/sign-in`, `/sign-up`, `/dashboard`). |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL/TOKEN`) | Upstash Redis for fair-use rate limiting. Unset = no throttling. |
| `ADMIN_USER_IDS` | Comma-separated Clerk user ids allowed to see the System page's event log. Unset = nobody can (closed by default). Find yours with `window.Clerk.user.id` while signed in. |

## Data service (`services/fundamentals-api/.env`)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL. Plain `postgresql://` URLs (as Neon issues) are accepted and normalised. |
| `IPO_INGEST_TOKEN`, `SCREENER_INGEST_TOKEN` | See *Shared secrets*. |

## GitHub Actions

Repository **secrets**: `CRON_SECRET`, `IPO_INGEST_TOKEN`, `SCREENER_INGEST_TOKEN`.
Repository **variables** (all optional, with working defaults): `FUNDAMENTALS_API_URL`, `CRON_TARGET_URL`, `INDEX_CORPUS_URL`, `AGENTS_TICK_URL`, `AGENTS_REFLECT_URL`, `REFRESH_SCREENER_QUOTES_URL`.

See [Operations Runbook](Operations-Runbook) for what each scheduled job does.
