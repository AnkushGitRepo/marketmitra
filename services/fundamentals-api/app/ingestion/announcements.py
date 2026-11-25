"""Exchange announcements for a company (#365): what kind of event a filing is.

Screener's Documents section lists the company's recent stock-exchange announcements (Regulation 30 disclosures,
credit ratings, "clarification sought", auditor and director changes, litigation notices). The research report reads
them as evidence for its legal, governance and management chapters, so each one is given a category by rules over its
title and summary. The rules are ordered: the first match wins, and the more specific, higher-stakes events come first
(a credit-rating filing that says "no litigation" is a rating; an order from a tribunal naming a director is litigation).
"""

from __future__ import annotations

import re
from typing import Final

ANNOUNCEMENT_CATEGORIES: Final[tuple[str, ...]] = (
    "credit_rating",
    "litigation",
    "auditor",
    "pledge",
    "management",
    "clarification",
    "results",
    "investor_meet",
    "fundraise",
    "restructuring",
    "related_party",
    "corporate_action",
    "other",
)

_RULES: Final[tuple[tuple[str, re.Pattern[str]], ...]] = tuple(
    (category, re.compile(pattern, re.IGNORECASE))
    for category, pattern in (
        ("credit_rating", r"credit rating|rating action|\bratings?\b|\bcrisil\b|\bicra\b|\bcare ratings\b"),
        (
            "litigation",
            (
                r"litigation|\bcourt\b|tribunal|\bnclt\b|\bnclat\b|\bsat\b|penalt(?:y|ies)|show[- ]cause|arbitration|"
                r"(?:tax|gst|customs|income[- ]tax) demand|demand notice|enforcement directorate|adjudicat|"
                r"\bfined?\b|\bwrit petition\b|\bsuit\b"
            ),
        ),
        ("auditor", r"\bauditors?\b"),
        ("pledge", r"pledge|encumbrance|invocation"),
        (
            "management",
            (
                r"resignation|appointment|cessation|\bdirector\b|\bceo\b|\bcfo\b|chief (?:executive|financial|operating)|"
                r"key managerial|company secretary|compliance officer"
            ),
        ),
        ("clarification", r"clarification"),
        ("results", r"financial results|outcome of board meeting|\bresults\b"),
        ("investor_meet", r"investor meet|analyst|earnings call|\bconcall\b|conference call|transcript"),
        ("fundraise", r"fund[- ]?raising|preferential|\bqip\b|rights issue|debenture|\bncds?\b|warrants"),
        ("restructuring", r"scheme of arrangement|amalgamation|merger|demerger|acquisition|takeover|slump sale"),
        ("related_party", r"related party"),
        ("corporate_action", r"dividend|buy-?back|\bbonus\b|stock split|record date"),
    )
)


def categorise_announcement(title: str, summary: str | None) -> str:
    """The category of an announcement: the first rule that matches its title and summary, else ``other``."""
    text = f"{title} {summary or ''}"
    for category, pattern in _RULES:
        if pattern.search(text):
            return category
    return "other"
