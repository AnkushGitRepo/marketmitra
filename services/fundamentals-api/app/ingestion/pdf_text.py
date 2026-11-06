"""Plain running-text extraction from a remote PDF.

This is the text feed for MarketMitra's Phase 10 retrieval corpus
(ADR 0020): the main app's corpus indexer POSTs an annual-report / DRHP
URL here and gets back page text to chunk and embed. It is deliberately
separate from ``pdf_financials.py`` — that one hunts for financial *tables*
with pdfplumber + camelot; this one just pulls readable prose.

``pdfplumber`` is imported lazily inside :func:`extract_pages` so a
self-host that trims it degrades to a clear error instead of failing app
startup — the same lesson as the Tier 1 filing-discovery regression. It is
in ``requirements.txt`` for the Vercel deployment because this module *is*
on a live route (unlike ``pdf_financials.py``).
"""

from __future__ import annotations

import asyncio
import logging
from io import BytesIO
from urllib.parse import urljoin

import httpx

from app.security import UnsafeUrlError, validate_public_url

logger = logging.getLogger("fundamentals.pdf_text")

# DRHPs and annual reports run large; refuse only the genuinely absurd.
MAX_PDF_BYTES = 48 * 1024 * 1024
DOWNLOAD_TIMEOUT_SECONDS = 60.0
_UA = "MarketMitra/1.0 (+https://marketmitra-v2.vercel.app; fundamentals-api)"


class PdfTextError(RuntimeError):
    """Download or extraction failed in a way the caller should surface."""


_MAX_REDIRECTS = 5


async def download_pdf(url: str) -> bytes:
    """Fetch a PDF, refusing anything that would turn this into an SSRF proxy.

    Every hop (the original URL and each redirect) must resolve to public
    addresses only, redirects are followed manually so none is trusted blindly,
    and the body is streamed with a hard size cap instead of being loaded whole.
    """
    current = url
    try:
        async with httpx.AsyncClient(timeout=DOWNLOAD_TIMEOUT_SECONDS, follow_redirects=False) as client:
            for _ in range(_MAX_REDIRECTS + 1):
                try:
                    # getaddrinfo blocks, so keep it off the event loop.
                    await asyncio.to_thread(validate_public_url, current)
                except UnsafeUrlError as exc:
                    raise PdfTextError(f"refusing to fetch: {exc}") from exc

                async with client.stream("GET", current, headers={"User-Agent": _UA}) as response:
                    if response.is_redirect:
                        location = response.headers.get("location", "")
                        if not location:
                            raise PdfTextError("redirect without a Location header")
                        current = urljoin(current, location)
                        continue
                    response.raise_for_status()
                    chunks: list[bytes] = []
                    size = 0
                    async for chunk in response.aiter_bytes():
                        size += len(chunk)
                        if size > MAX_PDF_BYTES:
                            raise PdfTextError(f"PDF too large (limit {MAX_PDF_BYTES} bytes)")
                        chunks.append(chunk)
                    content_type = response.headers.get("content-type", "").lower()
                    body = b"".join(chunks)
                break
            else:
                raise PdfTextError("too many redirects")
    except httpx.HTTPError as exc:
        raise PdfTextError(f"could not fetch PDF: {exc}") from exc

    if not body[:1024].lstrip().startswith(b"%PDF-") and "pdf" not in content_type:
        raise PdfTextError("response does not look like a PDF")
    return body


def extract_pages(pdf_bytes: bytes, *, max_pages: int | None = None) -> list[dict]:
    """Return ``[{"page": 1-based int, "text": str}, ...]`` for pages that
    carry any text. Pages that are pure images yield nothing (no OCR)."""
    try:
        import pdfplumber
    except ModuleNotFoundError as exc:  # pragma: no cover - only when trimmed
        raise PdfTextError("pdfplumber is not installed") from exc

    pages: list[dict] = []
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            for index, page in enumerate(pdf.pages):
                if max_pages is not None and index >= max_pages:
                    break
                text = (page.extract_text() or "").strip()
                if text:
                    pages.append({"page": index + 1, "text": text})
    except Exception as exc:  # pdfminer raises a grab-bag of exception types
        raise PdfTextError(f"could not parse PDF: {exc}") from exc
    return pages


async def fetch_pdf_text(url: str, *, max_pages: int | None = None) -> dict:
    """Download ``url`` and extract its text. Raises :class:`PdfTextError`
    on any failure so the route can map it to a 4xx/5xx."""
    body = await download_pdf(url)
    pages = extract_pages(body, max_pages=max_pages)
    return {
        "url": url,
        "bytes": len(body),
        "page_count": len(pages),
        "pages": pages,
        "text": "\n\n".join(p["text"] for p in pages),
    }
