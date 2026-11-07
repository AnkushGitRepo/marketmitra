"""Shared security helpers: constant-time bearer checks and SSRF guards.

Everything here is deliberately small and dependency-free so it is easy to
audit — it sits in front of the write endpoints and the URL fetcher.
"""

from __future__ import annotations

import hmac
import ipaddress
import socket
from dataclasses import dataclass
from collections.abc import Callable
from urllib.parse import urlsplit, urlunsplit

from fastapi import HTTPException


def require_bearer(authorization: str | None, token: str | None, *, name: str) -> None:
    """Raise unless ``authorization`` is exactly ``Bearer <token>``.

    Fails closed (503) when the token isn't configured, so a missing env var
    can never turn a protected endpoint into an open one. The comparison is
    constant-time: a plain ``!=`` leaks how many leading characters matched.
    """
    if not token:
        raise HTTPException(status_code=503, detail=f"{name} not configured")
    expected = f"Bearer {token}".encode()
    supplied = (authorization or "").encode()
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="unauthorized")


def log_safe(value: object, *, limit: int = 200) -> str:
    """Render ``value`` for a log line without letting it forge extra lines.

    Symbols, query params and upstream error text can carry attacker-chosen
    CR/LF; written verbatim they could fake log entries. Newlines are escaped
    (not dropped, so the original is still recognisable) and the length is
    capped so one request cannot flood the log.
    """
    text = str(value).replace("\\", "\\\\").replace("\r", "\\r").replace("\n", "\\n")
    return text if len(text) <= limit else f"{text[:limit]}…"


class UnsafeUrlError(ValueError):
    """The URL points somewhere a server-side fetch must not go."""


def is_public_ip(value: str) -> bool:
    """True only for a globally routable IP literal (hostnames return False)."""
    try:
        ip = ipaddress.ip_address(value.split("%")[0])
    except ValueError:
        return False
    # IPv4-mapped IPv6 (::ffff:127.0.0.1) must be judged by the embedded v4.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def _system_resolve(host: str) -> list[str]:
    return [info[4][0] for info in socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)]


@dataclass(frozen=True)
class PinnedTarget:
    """A validated destination to connect to.

    ``request_url`` has the hostname replaced by the exact public IP that was
    checked, so the connection cannot be redirected by a second DNS lookup
    (DNS rebinding: a name that answers "public" to the check and "internal"
    to the connect). ``host_header`` and ``sni_hostname`` keep the original
    name so virtual hosting and TLS certificate verification still work.
    """

    request_url: str
    host_header: str
    sni_hostname: str | None


def resolve_public_target(url: str, *, resolve: Callable[[str], list[str]] = _system_resolve) -> PinnedTarget:
    """Return a :class:`PinnedTarget` for ``url``, or raise :class:`UnsafeUrlError`
    unless it is http(s) to public hosts only.

    Resolves the hostname **once** and requires *every* answer to be public (a
    name with one internal A record is refused), then pins the connection to
    the first answer. Call this for each redirect hop too.
    """
    try:
        parts = urlsplit(url)
        port = parts.port
    except ValueError as exc:
        raise UnsafeUrlError("malformed URL") from exc
    if parts.scheme not in ("http", "https"):
        raise UnsafeUrlError("URL must be http(s)")
    if parts.username or parts.password:
        raise UnsafeUrlError("URL must not contain credentials")
    host = parts.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")
    literal = _is_ip_literal(host)
    try:
        addresses = [host] if literal else resolve(host)
    except OSError as exc:
        raise UnsafeUrlError("host did not resolve") from exc
    if not addresses or not all(is_public_ip(a) for a in addresses):
        raise UnsafeUrlError("URL resolves to a non-public address")

    host_header = f"{host}:{port}" if port else host
    if literal:
        return PinnedTarget(request_url=url, host_header=host_header, sni_hostname=None)
    ip = addresses[0]
    netloc = f"[{ip}]" if ":" in ip else ip
    if port:
        netloc = f"{netloc}:{port}"
    pinned = urlunsplit((parts.scheme, netloc, parts.path, parts.query, ""))
    return PinnedTarget(
        request_url=pinned,
        host_header=host_header,
        sni_hostname=host if parts.scheme == "https" else None,
    )


def validate_public_url(url: str, *, resolve: Callable[[str], list[str]] = _system_resolve) -> None:
    """Raise :class:`UnsafeUrlError` unless ``url`` is http(s) to public hosts.
    Validation only; use :func:`resolve_public_target` when you will connect."""
    resolve_public_target(url, resolve=resolve)


def _is_ip_literal(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True
