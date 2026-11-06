"""In-memory ranked symbol/company search over the NSE universe.

~2,600 rows is tiny, so ranking happens in Python over a cached snapshot
rather than in SQL per keystroke: it is testable offline, needs no Postgres
extension, and gives typo tolerance (difflib) for free. search_service.py
owns loading/caching the snapshot.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from difflib import SequenceMatcher

_ISIN_RE = re.compile(r"^IN[EF][0-9A-Z]{9}$")
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
# Suffix noise that never helps a user find a company ("Tata Motors Limited").
_STOPWORDS = frozenset({"limited", "ltd", "the", "and", "of"})

_FUZZY_MIN_LEN = 4
_FUZZY_MIN_RATIO = 0.78


@dataclass(frozen=True)
class CompanyEntry:
    symbol: str
    name: str
    isin: str | None = None
    series: str | None = None
    is_sme: bool = False
    sector: str | None = None
    market_cap: float | None = None


def _words(text: str) -> list[str]:
    return [w for w in _NON_ALNUM.split(text.lower()) if w]


def _name_words(name: str) -> list[str]:
    return [w for w in _words(name) if w not in _STOPWORDS]


def _score(entry: CompanyEntry, query: str, tokens: list[str]) -> float:
    """0 = no match. Higher is better; tiers are spaced so tie-breaks (SME
    last, bigger market cap first) never reorder across match quality."""
    symbol = entry.symbol.lower()
    name = entry.name.lower()
    words = _name_words(entry.name)
    compact_q = "".join(tokens)

    if entry.isin and entry.isin.upper() == query.upper():
        return 1000
    if symbol == compact_q:
        return 100
    if symbol.startswith(compact_q):
        return 90
    if name.startswith(query.lower()):
        return 80
    if all(any(w.startswith(t) for w in words) for t in tokens):
        return 70
    if compact_q in symbol:
        return 50
    if all(t in name for t in tokens):
        return 40
    if len(compact_q) >= _FUZZY_MIN_LEN:
        candidates = [symbol, *words]
        best = max(SequenceMatcher(None, compact_q, c).ratio() for c in candidates)
        if best >= _FUZZY_MIN_RATIO:
            return 30 * best
    return 0


def rank_companies(entries: list[CompanyEntry], query: str, limit: int = 15) -> list[CompanyEntry]:
    query = query.strip()
    tokens = _words(query)
    if not tokens:
        return []
    if _ISIN_RE.match(query.upper()):
        tokens = [query.lower()]

    scored: list[tuple[float, CompanyEntry]] = []
    for entry in entries:
        score = _score(entry, query, tokens)
        if score > 0:
            scored.append((score, entry))

    scored.sort(
        key=lambda pair: (
            -pair[0],
            pair[1].is_sme,
            -(pair[1].market_cap or 0.0),
            len(pair[1].symbol),
            pair[1].symbol,
        )
    )
    return [entry for _, entry in scored[:limit]]
