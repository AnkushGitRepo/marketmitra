"""Tier 3: category-wise IPO subscription (#285), from the aggregator's per-IPO subscription page.

The live dashboard row links to `/gmp/<slug>/<id>/`; the same slug and id under `/subscription/` is the subscription page, whose
`bid-table` has one row per bidding day with the multiple for QIB, NII, small NII, big NII, retail (RII) and the total. The latest
row is the current state. Parsing is split from fetching so it runs against a saved page with no network, like the dashboard parser
(`scraper.py`); the out-of-band refresh job renders the page and calls `parse_subscription`.

Same source, ToS position and caveats as the dashboard scrape (README.md here, ADR 0017). A figure that is missing or dashed is left
unknown (None), never zero. `sub_total` is returned for checking only: the dashboard's overall figure stays the stored `subscription_times`.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime

from scrapling.parser import Selector

from .scraper import _IST, _MONTHS, _num

logger = logging.getLogger("fundamentals.tier3_ipo")

# The live page links rows relatively (`/gmp/<slug>/<id>/`); a saved copy of it has them absolute. Either way it must be this site's gmp page.
_GMP_LINK_RE = re.compile(r"^(?:https://(?:www\.)?investorgain\.com)?/gmp/([a-z0-9-]+)/(\d+)/?$")
_AS_OF_RE = re.compile(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]{2})\s+(\d{4})\s+(\d{1,2}):(\d{2})")

# header text (letters only, lower-cased) -> the key it fills
_COLUMNS = {
    "qib": "sub_qib",
    "nii": "sub_nii",
    "snii": "sub_snii",
    "bnii": "sub_bnii",
    "rii": "sub_retail",
    "total": "sub_total",
}


def subscription_url(gmp_link: str | None) -> str | None:
    """The subscription page (always absolute) for a dashboard row's `/gmp/<slug>/<id>/` link, relative or absolute; None for any other
    link (a different host, a protocol-relative one, the report page, a link without an id), so nothing but an aggregator subscription
    page is ever fetched."""
    m = _GMP_LINK_RE.match(gmp_link or "")
    return f"https://www.investorgain.com/subscription/{m.group(1)}/{m.group(2)}/" if m else None


def _as_of(text: str) -> datetime | None:
    m = _AS_OF_RE.search(text)
    if not m or m.group(2) not in _MONTHS:
        return None
    try:
        return datetime(int(m.group(3)), _MONTHS[m.group(2)], int(m.group(1)), int(m.group(4)), int(m.group(5)), tzinfo=_IST)
    except ValueError:
        return None


def _multiple(text: str) -> float | None:
    """'11.98x' -> 11.98; '--', '-' or empty -> None."""
    cleaned = text.strip()
    return _num(cleaned) if cleaned and cleaned not in {"-", "--"} else None


def parse_subscription(html: str) -> dict | None:
    """The latest bidding day's category multiples and its timestamp, or None when the page has no bid table or no rows yet."""
    tables = Selector(html).css("table.bid-table")
    if not tables:
        return None
    table = tables[0]
    headers = [re.sub(r"[^a-z]", "", h.get_all_text(strip=True).lower()) for h in table.css("thead th")]
    rows = table.css("tbody tr")
    if not rows:
        return None
    cells = [c.get_all_text(strip=True) for c in rows[-1].css("td")]
    if len(cells) != len(headers):
        logger.warning("subscription table: %d headers but %d cells in the latest row", len(headers), len(cells))
        return None

    by_header = dict(zip(headers, cells, strict=True))
    out: dict = {key: _multiple(by_header.get(col, "")) for col, key in _COLUMNS.items()}
    out["sub_as_of"] = _as_of(by_header.get("date", ""))
    return out
