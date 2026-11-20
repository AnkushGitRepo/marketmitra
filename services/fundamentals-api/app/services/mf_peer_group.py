"""Peer groups finer than SEBI's sub-category (ADR 0067).

SEBI files every sectoral and thematic equity fund, and every foreign-equity feeder
fund, under one "Thematic Fund" sub-category, so "peers" by sub-category alone put a
Taiwan fund beside a defence fund. For that sub-category the theme is read from the
scheme name; every other sub-category is already a fair comparison and is kept as is.
"""

from __future__ import annotations

import re

# SEBI's two sector/theme sub-categories reach us under several spellings ("Thematic Fund",
# "Sectoral Fund", "Sectoral/ Thematic"); all of them mix unrelated themes.
_THEMATIC_SUB_CATEGORY = re.compile(r"^(thematic|sectoral)\b", re.IGNORECASE)
OTHER_THEMATIC = "Other thematic"

# Order matters: the first match wins, so a specific theme sits before a broad one
# ("Banking and Financial Services" before "Services", "US Equity Opportunities"
# before "Opportunities").
_THEMES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("International", re.compile(r"\b(taiwan|japan|us equity|us bluechip|china|asian?|global|overseas|nasdaq|world|europe|asean|international)\b", re.IGNORECASE)),
    ("Defence", re.compile(r"\bdefen[cs]e\b", re.IGNORECASE)),
    ("Healthcare", re.compile(r"\b(health\w*|wellness|pharma\w*|medical)\b", re.IGNORECASE)),
    ("Financial services", re.compile(r"\b(banking|financial)\b", re.IGNORECASE)),
    ("Services", re.compile(r"\bservices\b", re.IGNORECASE)),
    ("PSU", re.compile(r"\bpsu\b", re.IGNORECASE)),
    ("Infrastructure", re.compile(r"\b(infra\w*|t\.?i\.?g\.?e\.?r\.?|transportation)\b", re.IGNORECASE)),
    ("Technology", re.compile(r"\b(technology|digital|teck)\b", re.IGNORECASE)),
    ("Innovation", re.compile(r"\binnovati\w*\b", re.IGNORECASE)),
    ("Consumption", re.compile(r"\b(consumption|consumer|fmcg)\b", re.IGNORECASE)),
    ("Housing", re.compile(r"\bhousing\b", re.IGNORECASE)),
    ("Rural", re.compile(r"\brural\b", re.IGNORECASE)),
    ("Conglomerate", re.compile(r"\bconglomerates?\b", re.IGNORECASE)),
    ("Manufacturing", re.compile(r"\b(manufactur\w*|automotive|export)\b", re.IGNORECASE)),
    ("Business cycle", re.compile(r"\bbusiness cycles?\b", re.IGNORECASE)),
    ("Energy and resources", re.compile(r"\b(energy|natural resources|commodit\w*|comma|power)\b", re.IGNORECASE)),
    ("Quant and factor", re.compile(r"\b(quant\w*|momentum|multi[- ]factor|sector rotation)\b", re.IGNORECASE)),
    ("Quality", re.compile(r"\bquality\b", re.IGNORECASE)),
    ("ESG", re.compile(r"\b(esg|ethical)\b", re.IGNORECASE)),
    ("MNC", re.compile(r"\bmnc\b", re.IGNORECASE)),
    ("Special situations", re.compile(r"\bspecial opportunities\b", re.IGNORECASE)),
)


def is_thematic_sub_category(sub_category: str) -> bool:
    """True for SEBI's sector and theme sub-categories, whatever the spelling."""
    return _THEMATIC_SUB_CATEGORY.match(sub_category) is not None


def peer_group(name: str, sub_category: str | None) -> str | None:
    """The group a fund is compared within; None when the fund has no sub-category."""
    if sub_category is None:
        return None
    if not is_thematic_sub_category(sub_category):
        return sub_category
    for label, pattern in _THEMES:
        if pattern.search(name):
            return label
    return OTHER_THEMATIC
