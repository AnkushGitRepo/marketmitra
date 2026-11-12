"""Fair-use rate limiting for the public fundamentals API (Phase 9, ADR 0019).

Fixed-window counter per client IP, stored in Upstash Redis via its REST API
(`httpx` only — no `redis` dependency, works fine in a Vercel serverless
function). If the Upstash env vars are unset the limiter is a **no-op
pass-through**, so local dev and any self-host deployment are never
throttled.

The main Next.js app already rate-limits `/api/*` and the MCP endpoint; this
closes the one remaining path — hitting this service's public URL directly.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

import httpx

from app.config import Settings

logger = logging.getLogger(__name__)

_WINDOW_SECONDS = 60
# A little longer than the window so a key that's still being read against
# can't be evicted mid-window.
_KEY_TTL_SECONDS = 65


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    limit: int
    remaining: int
    retry_after: int  # seconds until the window rolls over


def _passthrough(settings: Settings) -> RateLimitResult:
    return RateLimitResult(True, settings.rate_limit_per_minute, settings.rate_limit_per_minute, 0)


def is_enabled(settings: Settings) -> bool:
    return bool(settings.upstash_redis_rest_url and settings.upstash_redis_rest_token)


async def check_rate_limit(ip: str, settings: Settings) -> RateLimitResult:
    """Consume one unit of `ip`'s budget for the current minute-window.

    Fails **open**: any transport/store error returns `allowed=True` rather
    than taking the endpoint down.
    """
    if not is_enabled(settings):
        return _passthrough(settings)

    now = int(time.time())
    window = now // _WINDOW_SECONDS
    key = f"mmf:rl:{ip}:{window}"
    reset_in = _WINDOW_SECONDS - (now % _WINDOW_SECONDS)

    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.post(
                f"{settings.upstash_redis_rest_url.rstrip('/')}/pipeline",
                headers={"Authorization": f"Bearer {settings.upstash_redis_rest_token}"},
                json=[["INCR", key], ["EXPIRE", key, str(_KEY_TTL_SECONDS), "NX"]],
            )
        resp.raise_for_status()
        count = int(resp.json()[0]["result"])
    except Exception as exc:  # noqa: BLE001 — deliberate fail-open
        logger.warning("rate-limit check failed, allowing request: %s", exc)
        return _passthrough(settings)

    limit = settings.rate_limit_per_minute
    remaining = max(0, limit - count)
    return RateLimitResult(count <= limit, limit, remaining, reset_in)


def client_ip(headers: httpx.Headers | dict, fallback: str | None) -> str:
    """The caller's IP for rate limiting.

    Platform-set headers win: on Vercel ``x-vercel-forwarded-for`` / ``x-real-ip``
    are written by the edge and can't be forged, whereas the *first* hop of
    ``x-forwarded-for`` is whatever the client sent — rotating it would dodge
    the limit. ``x-forwarded-for`` is only a fallback, then the socket peer.

    On Cloud Run (``K_SERVICE`` is set) Google's front end appends the real client
    IP to the END of ``x-forwarded-for``, so the last hop is the trustworthy one
    and the first is client-controlled.
    """
    get = headers.get if hasattr(headers, "get") else (lambda _k: None)
    for name in ("x-vercel-forwarded-for", "x-real-ip"):
        value = get(name)
        if value and value.strip():
            return value.split(",")[0].strip()
    xff = get("x-forwarded-for")
    if xff:
        hops = [hop.strip() for hop in xff.split(",") if hop.strip()]
        if hops:
            return hops[-1] if os.environ.get("K_SERVICE") else hops[0]
    return fallback or "unknown-ip"
