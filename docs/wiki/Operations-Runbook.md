# Operations Runbook

How to keep a MarketMitra deployment healthy. Written for whoever operates it.

## Scheduled jobs

All jobs run as **GitHub Actions** (times are UTC; GitHub only runs `schedule:` triggers from the default branch). Each can also be started by hand from **Actions → the workflow → Run workflow**.

| Workflow | Schedule | What it does | Needs |
| --- | --- | --- | --- |
| `evaluate-alerts` | every 10 min, 03:00–10:59, Mon–Fri | Evaluates every active alert against live prices and delivers notifications | `CRON_SECRET` |
| `agents-tick` | every 5 min | Advances queued multi-agent analysis runs | `CRON_SECRET` |
| `agents-reflect` | daily 02:40 | The daily reflection pass over past analyses | `CRON_SECRET` |
| `index-corpus` | every 2 hours | Re-indexes news into the retrieval corpus (re-embeds only changed items) | `CRON_SECRET` |
| `refresh-ipos` | every 2 hours, 03:00–15:00 | Scrapes the IPO calendar, subscription and GMP into the data service | `IPO_INGEST_TOKEN` |
| `refresh-screener-quotes` | weekdays 11:00 | Daily Yahoo quotes → market cap, price, P/E, P/B, yield for **all** listed companies | `CRON_SECRET` (+ `SCREENER_INGEST_TOKEN` on the app) |
| `refresh-screener` | daily 20:30 | Incremental Screener.in scrape of the ~400 stalest companies | `SCREENER_INGEST_TOKEN` |
| `CodeQL`, `Dependency review` | push / PR / weekly | Security scanning — see [Security](Security) | — |

## First data load

On a fresh deployment the screener, news and IPO tables are empty. Load them in this order:

1. **Company list.** Filled automatically on the first search or screener request.
2. **Prices for the whole universe.** Run **`refresh-screener-quotes`** once. It takes about 15 seconds and fills market cap, price, P/E, P/B and yield for every listed company.
3. **Fundamentals.** Run **`refresh-screener`** with **`full`** ticked. It scrapes the entire universe at roughly 0.8 companies a second — about **55 minutes** — and the job has a 90-minute limit. Afterwards the daily incremental run keeps it fresh.
4. **News corpus.** Run **`index-corpus`** (and once with `?indexesOnly=1` to create the Atlas vector index).
5. **IPOs.** Run **`refresh-ipos`**.

Check progress at any time:

```bash
curl https://<data-service>/screener/stats
# { "universe": 2630, "with_quotes": 2630, "with_fundamentals": 2200, ... }
```

If a full run is cancelled partway, nothing is lost: ingestion is batched, and the next incremental run picks up the stalest companies first.

## Health checks

- **`/status`** — public status page; **`/system`** — operator view with the event log. It is hidden (no sidebar entry) and returns 404 to everyone but admins (hosted: only users in `ADMIN_USER_IDS`; self-host: the local user). The app footer links to `/status`.
- **`scripts/smoke-test.sh`** — fast external check after a deploy.
- **`GET <data-service>/health`** — the data service is up.
- **Event log** — failed cron runs and chat-stream errors are recorded under their source (for example `cron:refresh-screener-quotes`, `api:ai/chat`).

## Routine tasks

| Task | How |
| --- | --- |
| Rotate a shared secret | Generate a new value (`openssl rand -hex 32`); update it on **every** component that uses it (both Vercel projects and the GitHub secret); redeploy both projects. A mismatch shows up as `401` from the ingest endpoints. |
| Run a migration | See [Deployment → Migrations](Deployment#migrations). Always before deploying code that needs it. |
| Re-run a failed job | Actions → the workflow → *Re-run*, or Run workflow. Jobs are safe to repeat. |
| Add an operator | Add their Clerk user id to `ADMIN_USER_IDS` and redeploy. |
| Refresh the company list | It reloads when the table is empty or lacks ISINs. |

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Screener shows no sectors, or ROE/growth filters match nothing | Fundamentals haven't been scraped yet | Run `refresh-screener` (full for the first time). The coverage line on the page says how far along it is. |
| Screener prices are stale | `refresh-screener-quotes` failed or `SCREENER_INGEST_TOKEN` is missing on the app | Check the workflow run and the event log; the route returns 503 when the token isn't set. |
| `refresh-screener` fails immediately | A dependency is missing in the workflow, or the ingest token is wrong | Read the run log; the token is `SCREENER_INGEST_TOKEN` on the data service, the repo secret and the app. |
| `refresh-screener` is cancelled | Hit the 90-minute limit on a full run | Run the incremental job; it continues where it left off. |
| Alerts never fire | The scheduler isn't running or `CRON_SECRET` mismatches | Check `evaluate-alerts` runs and the secret on both sides. |
| Mitra says it "could not answer" | The user's AI key is invalid, out of quota, or rejected | Re-enter the key in Settings; see the event log entry `api:ai/chat`. |
| Search or IPO data is empty | The data service can't reach NSE or the scrape target (datacenter IPs are sometimes blocked) | The company list falls back to bundled copies; IPO and GMP show "unavailable" until the source responds. |
| New code errors right after a deploy | The migration wasn't applied first | Apply it now; deploy order is migrate → data service → app. |

## Known operational limits

- Free data sources are unofficial and can block or change without notice — see [Data Sources](Data-Sources).
- A hosted Clerk **development** instance is in use; moving to a production instance is an open item ([Roadmap](Roadmap)).
- Free-tier hosting means cold starts: the first request to the data service after idle can be slow, and the embedding model downloads once per cold instance.
