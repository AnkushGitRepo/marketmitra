"""Peer groups finer than SEBI's sub-category (ADR 0067).

SEBI files every sectoral and thematic equity fund, and every foreign-equity feeder
fund, under one "Thematic Fund" sub-category, so "peers" by sub-category alone put a
Taiwan fund beside a defence fund. For that sub-category the theme is read from the
scheme name; every other sub-category is already a fair comparison and is kept as is.
"""

from __future__ import annotations

import re

THEMATIC = "Thematic Fund"
OTHER_THEMATIC = "Other thematic"

# Order matters: the first match wins, so a specific theme sits before a broad one
# ("Banking and Financial Services" before "Services", "US Equity Opportunities"
# before "Opportunities").
_THEMES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("International", re.compile(r"\b(taiwan|japan|us equity|china|global|overseas|nasdaq|world|europe|asean|international)\b", re.IGNORECASE)),
    ("Defence", re.compile(r"\bdefen[cs]e\b", re.IGNORECASE)),
    ("Healthcare", re.compile(r"\b(health ?care|pharma|medical)\b", re.IGNORECASE)),
    ("Financial services", re.compile(r"\b(banking|financial)\b", re.IGNORECASE)),
    ("Services", re.compile(r"\bservices\b", re.IGNORECASE)),
    ("PSU", re.compile(r"\bpsu\b", re.IGNORECASE)),
    ("Infrastructure", re.compile(r"\b(infra\w*|t\.?i\.?g\.?e\.?r\.?|transportation)\b", re.IGNORECASE)),
    ("Technology", re.compile(r"\b(technology|digital)\b", re.IGNORECASE)),
    ("Innovation", re.compile(r"\binnovation\b", re.IGNORECASE)),
    ("Consumption", re.compile(r"\b(consumption|consumer)\b", re.IGNORECASE)),
    ("Manufacturing", re.compile(r"\b(manufacturing|export)\b", re.IGNORECASE)),
    ("Business cycle", re.compile(r"\bbusiness cycles?\b", re.IGNORECASE)),
    ("Energy and resources", re.compile(r"\b(energy|natural resources|power)\b", re.IGNORECASE)),
    ("Quant and factor", re.compile(r"\b(quant|momentum|multi[- ]factor|sector rotation)\b", re.IGNORECASE)),
    ("Quality", re.compile(r"\bquality\b", re.IGNORECASE)),
    ("ESG", re.compile(r"\besg\b", re.IGNORECASE)),
    ("MNC", re.compile(r"\bmnc\b", re.IGNORECASE)),
    ("Special situations", re.compile(r"\bspecial opportunities\b", re.IGNORECASE)),
)


def peer_group(name: str, sub_category: str | None) -> str | None:
    """The group a fund is compared within; None when the fund has no sub-category."""
    if sub_category is None:
        return None
    if sub_category != THEMATIC:
        return sub_category
    for label, pattern in _THEMES:
        if pattern.search(name):
            return label
    return OTHER_THEMATIC
