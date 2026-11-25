"""Regulator press-release feeds as retrieval material for the research report (#365).

The report's regulatory chapter needs to know what RBI, TRAI and SEBI have said. Their public RSS feeds are mostly routine,
though: on 2026-11-25 the RBI feed was auction results and money-market operations, and TRAI's was consumer-awareness
workshops run by the operators. So each source has a filter for its routine items and only policy items are kept.

Kept items go into the same ``news_items`` table (so they are deduplicated, pruned and indexed for retrieval like news) under
their own source labels. The public news feed leaves those sources out by default (``include_regulatory``), and the item's
sentiment is neutral: a headline's tone says nothing about a notice.

Checked 2026-11-25 and not used: PIB and DoT answer 403 to non-browser clients (not bypassed), CCI and IRDAI publish no feed
(404), and SEBI's feed was an empty channel (kept, so it starts working if SEBI fills it).
"""

from __future__ import annotations

import logging
import re
from typing import Final

import feedparser
import httpx

from app.ingestion import news

logger = logging.getLogger(__name__)

REGULATOR_FEEDS: Final[list[tuple[str, str]]] = [
    ("RBI press release", "https://www.rbi.org.in/pressreleases_rss.xml"),
    ("TRAI", "https://www.trai.gov.in/rss.xml"),
    ("SEBI", "https://www.sebi.gov.in/sebirss.xml"),
]
REGULATOR_SOURCES: Final[frozenset[str]] = frozenset(label for label, _ in REGULATOR_FEEDS)

# Routine data releases and events, per source. SEBI has none: every SEBI item is an order, circular or consultation.
_ROUTINE: Final[dict[str, re.Pattern[str]]] = {
    "RBI press release": re.compile(
        r"auction|\bt-bills?\b|treasury bills?|money market operations|reference rate|weekly statistical|"
        r"statistical supplement|\bvrr\b|variable rate (?:repo|reverse repo)|liquidity adjustment facility|\blaf\b",
        re.IGNORECASE,
    ),
    "TRAI": re.compile(
        r"consumer (?:awareness|education)|workshop|awareness program|expression of interest|empanelment|"
        r"nodal officers?|mobile network quality|independent drive test",
        re.IGNORECASE,
    ),
}


def is_policy_item(source: str, title: str) -> bool:
    """False for a routine data release or event from ``source``, true for anything else."""
    routine = _ROUTINE.get(source)
    return not (routine and routine.search(title))


_USER_AGENT: Final = "MarketMitra research agent (+https://github.com/AnkushGitRepo/marketmitra)"
_TIMEOUT_SECONDS: Final = 20.0


async def _get_entries(url: str) -> list:
    """The entries of one feed. Downloaded with httpx (certifi's CA bundle, an honest User-Agent) and parsed from the
    text: feedparser's own downloader fails TLS verification on TRAI's server (missing intermediate certificate)."""
    async with httpx.AsyncClient(headers={"User-Agent": _USER_AGENT}, timeout=_TIMEOUT_SECONDS, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
    return list(feedparser.parse(response.text).entries)


async def fetch_regulator_items() -> list[dict]:
    """Policy items from every regulator feed, shaped like news items. A failing feed is skipped, not fatal."""
    out: list[dict] = []
    for source, url in REGULATOR_FEEDS:
        try:
            entries = await _get_entries(url)
        except Exception as exc:  # noqa: BLE001
            logger.warning("regulator feed %s failed: %s", source, exc)
            continue
        for entry in entries:
            item = news.entry_to_item(entry, source)
            if item is None or not is_policy_item(source, item["title"]):
                continue
            out.append({**item, "sentiment": "neutral", "sentiment_score": 0.0})
    return out
