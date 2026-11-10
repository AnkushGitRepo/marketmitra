"""Tier 3: IPO calendar + subscription + grey-market premium (GMP), from an
IPO/GMP aggregator (InvestorGain's "Live IPO GMP" report). See README.md in
this directory for the ToS position (accepted known risk, same terms as the
Screener.in scraper — ADR 0011 / ADR 0017).

Parsing (`_parse_ipo_rows`) is split from fetching (`fetch_ipo_list`) so it
runs against a maintainer-saved page
(`tests/fixtures/investorgain_ipo_gmp.html`) with no network — see
`tests/test_ipo_scraper.py`. GMP has no official or free-API source; it is
an unofficial grey-market estimate and every surface labels it so.

The aggregator's live page is a client-rendered SPA — a plain HTTP GET
returns the shell, not the table. Live ingestion therefore runs out of
band (a scheduled headless-browser job that POSTs rendered rows to
`/ipos/ingest`), not from the serverless request path; `fetch_ipo_list`
here is a best-effort direct attempt that returns [] when the rows aren't
in the response.
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

import httpx
from scrapling.parser import Selector

logger = logging.getLogger("fundamentals.tier3_ipo")

_IST = ZoneInfo("Asia/Kolkata")


def ist_today() -> date:
    """IPO calendar dates are IST — use the IST civil date, not UTC's."""
    return datetime.now(tz=_IST).date()


REPORT_URL = "https://www.investorgain.com/report/ipo-gmp-live/331/"
_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
}

_MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}
_DATE_RE = re.compile(r"(\d{1,2})[-\s]([A-Z][a-z]{2})")
_UPDATED_RE = re.compile(r"(\d{1,2})[-\s]([A-Z][a-z]{2})\s+(\d{1,2}):(\d{2})")


def _num(text: str | None) -> float | None:
    if not text:
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", text.replace(",", ""))
    return float(m.group()) if m else None


def _parse_dmon(text: str | None, ref: date) -> date | None:
    """'10-Sep' -> a date. Year inferred from `ref` (today): if the naive
    date lands >6 months ahead, it belongs to the previous year (Dec->Jan
    rollover); if >6 months behind, the next year."""
    if not text:
        return None
    m = _DATE_RE.search(text)
    if not m or m.group(2) not in _MONTHS:
        return None
    day, month = int(m.group(1)), _MONTHS[m.group(2)]
    for year in (ref.year, ref.year - 1, ref.year + 1):
        try:
            candidate = date(year, month, day)
        except ValueError:
            continue
        if abs((candidate - ref).days) <= 183:
            return candidate
    try:
        return date(ref.year, month, day)
    except ValueError:
        return None


def _cell(row: Selector, label: str) -> Selector | None:
    cells = row.css(f"td[data-label='{label}']")
    return cells[0] if cells else None


def _cell_text(row: Selector, label: str) -> str:
    c = _cell(row, label)
    return re.sub(r"\s+", " ", c.get_all_text(strip=True)).strip() if c else ""


def _slug_from_href(href: str | None) -> str | None:
    if not href:
        return None
    m = re.search(r"/gmp/([a-z0-9\-]+)/\d+/?", href)
    return m.group(1) if m else None


def _derive_status(open_d: date | None, close_d: date | None, listing_d: date | None,
                   ref: date, name_text: str) -> str:
    if "L@" in name_text or (listing_d and listing_d <= ref):
        return "listed"
    if close_d and close_d < ref:
        return "closed"
    if open_d and close_d and open_d <= ref <= close_d:
        return "open"
    if open_d and open_d > ref:
        return "upcoming"
    return "upcoming"


def _parse_gmp(row: Selector) -> dict:
    c = _cell(row, "GMP")
    if c is None:
        return {"gmp": None, "gmp_pct": None, "gmp_low": None, "gmp_high": None}
    html = c.html_content
    # "₹<b>30</b> (21.43%)" — gmp is the bolded number, pct in parens
    b = re.search(r"₹\s*<b>\s*(-?\d+(?:\.\d+)?|--)\s*</b>", html)
    gmp = None if (not b or b.group(1) == "--") else float(b.group(1))
    p = re.search(r"\(\s*(-?\d+(?:\.\d+)?)\s*%\s*\)", html)
    gmp_pct = float(p.group(1)) if p else None
    lo_hi = re.search(r"(-?\d+(?:\.\d+)?)\s*↓\s*/\s*(-?\d+(?:\.\d+)?)\s*↑", c.get_all_text())
    gmp_low = float(lo_hi.group(1)) if lo_hi else None
    gmp_high = float(lo_hi.group(2)) if lo_hi else None
    return {"gmp": gmp, "gmp_pct": gmp_pct, "gmp_low": gmp_low, "gmp_high": gmp_high}


_SME_BADGE_RE = re.compile(r"\bSME\b", re.IGNORECASE)


def _category_from_badges(badges: list[str]) -> str:
    """`sme` or `mainboard` from the badges beside an IPO's name.

    The aggregator badges a mainboard issue "IPO" and an SME issue by its
    exchange segment — "BSE SME" or "NSE SME" (never a bare "SME"), so match
    SME as a word rather than the whole badge. An exact-match check here once
    sent every SME issue to `mainboard`."""
    return "sme" if any(_SME_BADGE_RE.search(b) for b in badges) else "mainboard"


def _parse_row(row: Selector, ref: date) -> dict | None:
    name_cell = _cell(row, "Name")
    if name_cell is None:
        return None
    anchors = name_cell.css("a")
    if not anchors:
        return None
    href = anchors[0].attrib.get("href")
    slug = _slug_from_href(href)
    if not slug:
        return None
    name = (anchors[0].attrib.get("title") or anchors[0].get_all_text(strip=True) or "").strip()
    badges = [b.get_all_text(strip=True) for b in name_cell.css("span.badge")]
    category = _category_from_badges(badges)

    open_d = _parse_dmon(_cell_text(row, "Open"), ref)
    close_d = _parse_dmon(_cell_text(row, "Close"), ref)
    allot_d = _parse_dmon(_cell_text(row, "BoA Dt"), ref)
    listing_d = _parse_dmon(_cell_text(row, "Listing"), ref)

    sub_raw = _cell_text(row, "Sub")
    rating_raw = _cell_text(row, "Rating")
    updated_raw = _cell_text(row, "Updated-On")
    um = _UPDATED_RE.search(updated_raw)
    updated_on = None
    if um and um.group(2) in _MONTHS:
        d = _parse_dmon(f"{um.group(1)}-{um.group(2)}", ref)
        if d:
            updated_on = datetime(
                d.year, d.month, d.day, int(um.group(3)), int(um.group(4)), tzinfo=_IST
            )

    return {
        "slug": slug,
        "name": name,
        "source_url": href,
        "category": category,
        "status": _derive_status(open_d, close_d, listing_d, ref, name_cell.get_all_text()),
        **_parse_gmp(row),
        "rating": rating_raw.count("🔥") or None,
        "subscription_times": _num(sub_raw) if sub_raw not in ("", "-") else None,
        "price": _num(_cell_text(row, "Price (₹)")),
        "ipo_size_cr": _num(_cell_text(row, "IPO Size")),
        "lot_size": int(v) if (v := _num(_cell_text(row, "Lot"))) else None,
        "open_date": open_d,
        "close_date": close_d,
        "allotment_date": allot_d,
        "listing_date": listing_d,
        "anchor": "✅" in _cell_text(row, "Anchor"),
        "updated_on": updated_on,
    }


def _parse_ipo_rows(html: str, ref: date | None = None) -> list[dict]:
    ref = ref or ist_today()
    sel = Selector(html)
    out: list[dict] = []
    seen: set[str] = set()
    for row in sel.css("table tr"):
        if not row.css("td[data-label='Name']"):
            continue
        parsed = _parse_row(row, ref)
        if parsed and parsed["slug"] not in seen:
            seen.add(parsed["slug"])
            out.append(parsed)
    return out


async def fetch_ipo_list() -> list[dict]:
    """Best-effort direct fetch. The live report is a client-rendered SPA,
    so this usually returns [] — the reliable path is the out-of-band
    headless-browser job posting to /ipos/ingest. Returns [] on any
    failure; never raises."""
    try:
        async with httpx.AsyncClient(headers=_BROWSER_HEADERS, timeout=20.0) as client:
            response = await client.get(REPORT_URL, follow_redirects=True)
        if response.status_code != 200:
            logger.warning("investorgain fetch: HTTP %s", response.status_code)
            return []
        rows = _parse_ipo_rows(response.text)
        if not rows:
            logger.info("investorgain fetch: 0 rows in response (SPA shell) — use the ingest job")
        return rows
    except Exception as exc:  # noqa: BLE001
        logger.warning("investorgain fetch failed: %s", exc)
        return []
