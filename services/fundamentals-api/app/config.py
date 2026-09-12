from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def _normalize_database_url(raw: str) -> str:
    """Neon/Vercel hand out plain `postgresql://` URLs with libpq-only query
    params (`channel_binding`, `sslmode`, `connect_timeout`) that asyncpg's
    connect() rejects outright as unknown keyword arguments. Force the
    asyncpg driver and drop the query string entirely — Neon enforces TLS
    server-side regardless, and asyncpg negotiates it automatically without
    needing any of those params spelled out."""
    parts = urlsplit(raw)
    scheme = parts.scheme
    if scheme in ("postgres", "postgresql"):
        scheme = "postgresql+asyncpg"
    return urlunsplit((scheme, parts.netloc, parts.path, "", ""))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", populate_by_name=True
    )

    database_url: str = "postgresql+asyncpg://localhost/marketmitra_fundamentals"

    @field_validator("database_url")
    @classmethod
    def _validate_database_url(cls, value: str) -> str:
        return _normalize_database_url(value)
    nse_requests_per_second: float = 3.0
    tier3_enabled: bool = True
    # Tier 1 filing-URL discovery for financial statements (ADR 0011, Phase 4
    # follow-up): try the actual NSE/BSE results filing before the Screener
    # scrape. Off → financials come straight from Tier 3 as before.
    financials_tier1_enabled: bool = True
    log_level: str = "INFO"

    # Cache freshness: how old stored data can be before a request triggers
    # re-ingestion instead of serving straight from Postgres.
    financials_cache_ttl_hours: int = 24 * 7
    prices_cache_ttl_hours: int = 4
    ratios_cache_ttl_hours: int = 24

    # Live-quote endpoint (GET /quote) — in-process TTL so the alert cron and
    # any dashboard caller share one upstream yfinance hit. Seconds, not hours.
    quote_cache_ttl_seconds: int = 60

    # News feed (GET /news, ADR 0015). Lazy refresh-on-read: a read re-fetches
    # only when the newest relevant item is older than the TTL. Broad market
    # feeds move slower than per-company Google News queries.
    news_broad_cache_ttl_minutes: int = 30
    news_symbol_cache_ttl_minutes: int = 60
    news_retention_days: int = 30

    # IPO tracker (GET /ipos, ADR 0017). Lazy TTL: a read past this re-fetches
    # (best-effort — the aggregator is a SPA, so the reliable path is an
    # out-of-band job POSTing to /ipos/ingest). An IPO row is deleted once
    # its listing date is more than `ipo_listed_retention_days` in the past.
    ipo_cache_ttl_minutes: int = 60
    ipo_listed_retention_days: int = 10
    # Shared secret for POST /ipos/ingest (the headless-browser refresh job)
    # and the other server-to-server routes (/documents/extract-text, /embed).
    ipo_ingest_token: str = ""

    # Shared secret for POST /screener/ingest (scripts/refresh_screener_universe.py,
    # ADR 0025) — same trust boundary as ipo_ingest_token above.
    screener_ingest_token: str = ""

    # Retrieval embeddings for the main app's Phase 10 RAG (ADR 0020), served
    # from POST /embed via fastembed. Dimension MUST stay 384 (matches
    # EMBED_DIM on the Next side and the Atlas Vector Search index).
    embed_model: str = "BAAI/bge-small-en-v1.5"
    # All HF/fastembed caches go here — $HOME is read-only on Vercel. Keep in
    # step with the fallback in app/ingestion/embeddings.py.
    fastembed_cache_dir: str = "/tmp/mm-embed-cache"

    # Fair-use rate limiting (Phase 9, ADR 0019). Fixed-window per client IP,
    # via the Upstash Redis REST API (no new dependency — uses httpx). When
    # both URL and token are empty the limiter is a no-op pass-through, so
    # self-host / local dev is never throttled. Provision the same Upstash
    # instance the main app uses, on this Vercel project too. Accepts either
    # the Vercel-integration names (`KV_REST_API_*`) or the Upstash-native
    # ones (`UPSTASH_REDIS_REST_*`).
    upstash_redis_rest_url: str = Field(
        "", validation_alias=AliasChoices("UPSTASH_REDIS_REST_URL", "KV_REST_API_URL")
    )
    upstash_redis_rest_token: str = Field(
        "", validation_alias=AliasChoices("UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_TOKEN")
    )
    rate_limit_per_minute: int = 120


@lru_cache
def get_settings() -> Settings:
    return Settings()
